/**
 * Access and refresh token lifecycle.
 *
 * Design:
 *   - Access tokens are short-lived (15m) stateless JWTs. They are never
 *     stored server-side; verification is signature + expiry only.
 *   - Refresh tokens are long-lived opaque random strings. Only their SHA-256
 *     hash is stored, so a database leak cannot be replayed against us.
 *   - Refresh tokens rotate on every use. Presenting an already-rotated token
 *     is treated as theft and revokes the entire session family.
 */

import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import { env } from "../config/env.js"
import { supabase, unwrap } from "../config/supabase.js"
import { unauthorized } from "../utils/errors.js"

const REFRESH_BYTES = 48

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex")

/** Signs a stateless access token carrying the caller's identity and role. */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessTtl,
      issuer: env.jwt.issuer,
      audience: "kyren-api",
    },
  )
}

/** Verifies an access token, throwing 401 for anything invalid or expired. */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.jwt.accessSecret, {
      issuer: env.jwt.issuer,
      audience: "kyren-api",
    })
  } catch (err) {
    throw unauthorized(
      err.name === "TokenExpiredError"
        ? "Access token has expired"
        : "Invalid access token",
    )
  }
}

/**
 * Creates a session row and returns the raw refresh token. The raw value is
 * returned exactly once — only its hash is persisted.
 */
export async function issueRefreshToken(userId, { ip, userAgent } = {}) {
  const raw = crypto.randomBytes(REFRESH_BYTES).toString("base64url")
  const expiresAt = new Date(
    Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  )

  const session = unwrap(
    await supabase
      .from("auth_sessions")
      .insert({
        user_id: userId,
        refresh_token_hash: sha256(raw),
        expires_at: expiresAt.toISOString(),
        ip_address: ip?.slice(0, 64) ?? null,
        user_agent: userAgent?.slice(0, 500) ?? null,
      })
      .select("id, expires_at")
      .single(),
    "Creating auth session",
  )

  return { refreshToken: raw, sessionId: session.id, expiresAt }
}

/**
 * Rotates a refresh token: validates the presented token, marks it replaced,
 * and issues a fresh pair.
 *
 * Reuse detection: if the presented token was already rotated
 * (`replaced_by` set), we assume it was stolen and revoke every live session
 * for that user rather than just rejecting the request.
 */
export async function rotateRefreshToken(rawToken, { ip, userAgent } = {}) {
  if (!rawToken) throw unauthorized("Refresh token is required")

  const session = unwrap(
    await supabase
      .from("auth_sessions")
      .select("id, user_id, expires_at, revoked_at, replaced_by")
      .eq("refresh_token_hash", sha256(rawToken))
      .maybeSingle(),
    "Looking up auth session",
  )

  if (!session) throw unauthorized("Invalid refresh token")

  if (session.replaced_by) {
    await revokeAllSessions(session.user_id)
    throw unauthorized("Refresh token was already used. Please sign in again.")
  }

  if (session.revoked_at) throw unauthorized("Session has been revoked")

  if (new Date(session.expires_at) < new Date()) {
    throw unauthorized("Session has expired. Please sign in again.")
  }

  const user = unwrap(
    await supabase
      .from("users")
      .select("id, email, role, is_active")
      .eq("id", session.user_id)
      .single(),
    "Loading session user",
  )

  if (!user.is_active) throw unauthorized("This account has been deactivated")

  const next = await issueRefreshToken(user.id, { ip, userAgent })

  unwrap(
    await supabase
      .from("auth_sessions")
      .update({
        revoked_at: new Date().toISOString(),
        replaced_by: next.sessionId,
      })
      .eq("id", session.id)
      .select("id")
      .single(),
    "Rotating auth session",
  )

  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
  }
}

/** Revokes a single session by its raw refresh token (used by logout). */
export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return
  await supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("refresh_token_hash", sha256(rawToken))
    .is("revoked_at", null)
}

/** Revokes every live session for a user (logout-everywhere, theft response). */
export async function revokeAllSessions(userId) {
  await supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
}

export { sha256 }
