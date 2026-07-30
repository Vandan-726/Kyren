/**
 * Authentication service.
 *
 * Two credential types feed one session model:
 *   - email + bcrypt password
 *   - Google, verified through Firebase Admin
 *
 * Either path ends at `issueSession`, so refresh/rotation/revocation logic
 * exists exactly once. Accounts are keyed by email, which means signing in with
 * Google using an email that already has a password *links* the two rather
 * than creating a duplicate account.
 */

import bcrypt from "bcryptjs"

import { supabase, unwrap } from "../config/supabase.js"
import { verifyFirebaseIdToken } from "../config/firebase.js"
import { badRequest, conflict, unauthorized, serviceUnavailable } from "../utils/errors.js"
import {
  issueRefreshToken,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "./tokenService.js"

const BCRYPT_ROUNDS = 12

/**
 * A bcrypt hash of a value nobody can guess. Compared against when the email
 * does not exist so that "unknown email" and "wrong password" take the same
 * time and are indistinguishable to an attacker enumerating accounts.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.qJ5w0hVoQTKPvBSTLoq1SEZQ0Xn8yqu"

/** Columns safe to return to a client. Never includes password_hash. */
export const USER_COLUMNS =
  "id, email, first_name, last_name, phone, avatar_url, role, " +
  "onboarding_completed, is_active, is_verified, last_login_at, created_at, updated_at"

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase()

/** Splits a display name into the first/last columns the schema stores. */
function splitName(fullName, fallbackEmail) {
  const trimmed = String(fullName || "").trim()
  if (!trimmed) {
    return { first_name: normalizeEmail(fallbackEmail).split("@")[0] || null, last_name: null }
  }
  const parts = trimmed.split(/\s+/)
  return {
    first_name: parts[0].slice(0, 100),
    last_name: parts.length > 1 ? parts.slice(1).join(" ").slice(0, 100) : null,
  }
}

/**
 * Adds the derived fields the frontend expects (`full_name`, `auth_provider`)
 * without storing them redundantly in the database.
 */
export function decorateUser(row) {
  if (!row) return null
  const { password_hash, firebase_uid, ...rest } = row

  const name = [rest.first_name, rest.last_name].filter(Boolean).join(" ")
  const hasPassword = Boolean(password_hash)
  const hasGoogle = Boolean(firebase_uid)

  return {
    ...rest,
    full_name: name || rest.email?.split("@")[0] || null,
    has_password: hasPassword,
    auth_provider: hasPassword && hasGoogle ? "hybrid" : hasGoogle ? "google" : "password",
  }
}

function assertPasswordStrength(password) {
  const value = String(password || "")
  if (value.length < 8) throw badRequest("Password must be at least 8 characters long")
  if (value.length > 200) throw badRequest("Password must be at most 200 characters long")
}

async function findUserByEmail(email) {
  return unwrap(
    await supabase.from("users").select("*").eq("email", normalizeEmail(email)).maybeSingle(),
    "Looking up user by email",
  )
}

export async function getUserById(id) {
  const row = unwrap(
    await supabase
      .from("users")
      .select(`${USER_COLUMNS}, password_hash, firebase_uid`)
      .eq("id", id)
      .maybeSingle(),
    "Loading user",
  )
  return decorateUser(row)
}

/**
 * Creates the per-user rows every other feature assumes exist, so no
 * downstream query has to handle a missing profile or streak row.
 */
async function ensureUserScaffolding(userId) {
  await Promise.all([
    supabase.from("student_profiles").upsert({ user_id: userId }, { onConflict: "user_id" }),
    supabase.from("learning_streaks").upsert({ user_id: userId }, { onConflict: "user_id" }),
  ])
}

/** Mints the access + refresh pair returned by every auth entrypoint. */
async function issueSession(user, context = {}) {
  const { refreshToken, expiresAt } = await issueRefreshToken(user.id, context)
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  }
}

/* ------------------------------------------------------------------ */
/* Email + password                                                    */
/* ------------------------------------------------------------------ */

export async function registerWithPassword({ email, password, fullName }, context = {}) {
  const normalized = normalizeEmail(email)
  assertPasswordStrength(password)

  if (await findUserByEmail(normalized)) {
    throw conflict("An account with this email already exists")
  }

  let created
  try {
    created = unwrap(
      await supabase
        .from("users")
        .insert({
          email: normalized,
          password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          ...splitName(fullName, normalized),
          // No transactional email provider is wired up, so password accounts
          // are usable immediately instead of stranded behind an unsendable OTP.
          is_verified: true,
        })
        .select("*")
        .single(),
      "Creating user",
    )
  } catch (error) {
    // Unique violation from a concurrent signup with the same email.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      throw conflict("An account with this email already exists")
    }
    throw error
  }

  await ensureUserScaffolding(created.id)

  return { user: decorateUser(created), ...(await issueSession(created, context)) }
}

export async function loginWithPassword({ email, password }, context = {}) {
  const user = await findUserByEmail(email)

  const matches = await bcrypt.compare(String(password || ""), user?.password_hash || DUMMY_HASH)

  if (!user || !user.password_hash || !matches) {
    throw unauthorized("Invalid email or password")
  }
  if (!user.is_active) throw unauthorized("This account has been deactivated")

  await ensureUserScaffolding(user.id)
  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id)

  return { user: decorateUser(user), ...(await issueSession(user, context)) }
}

/* ------------------------------------------------------------------ */
/* Google via Firebase                                                 */
/* ------------------------------------------------------------------ */

export async function loginWithGoogle({ idToken }, context = {}) {
  let decoded
  try {
    decoded = await verifyFirebaseIdToken(idToken)
  } catch (error) {
    if (error.code === "FIREBASE_NOT_CONFIGURED") throw serviceUnavailable(error.message)
    throw unauthorized("Google sign-in could not be verified")
  }

  const email = normalizeEmail(decoded.email)
  if (!email) throw badRequest("This Google account has no email address")

  const existing = await findUserByEmail(email)
  let user

  if (existing) {
    // Link Google onto the existing account instead of creating a duplicate.
    const patch = {
      firebase_uid: decoded.uid,
      is_verified: true,
      last_login_at: new Date().toISOString(),
    }
    if (!existing.avatar_url && decoded.picture) patch.avatar_url = decoded.picture
    if (!existing.first_name && decoded.name) Object.assign(patch, splitName(decoded.name, email))

    user = unwrap(
      await supabase.from("users").update(patch).eq("id", existing.id).select("*").single(),
      "Linking Google account",
    )
  } else {
    user = unwrap(
      await supabase
        .from("users")
        .insert({
          email,
          firebase_uid: decoded.uid,
          ...splitName(decoded.name, email),
          avatar_url: decoded.picture || null,
          is_verified: true,
          last_login_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "Creating Google user",
    )
  }

  if (!user.is_active) throw unauthorized("This account has been deactivated")

  await ensureUserScaffolding(user.id)

  return {
    user: decorateUser(user),
    ...(await issueSession(user, context)),
    isNewUser: !existing,
  }
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

export async function refresh({ refreshToken }, context = {}) {
  const rotated = await rotateRefreshToken(refreshToken, context)

  return {
    // Return the full profile so the client can rehydrate from a refresh alone.
    user: await getUserById(rotated.user.id),
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: rotated.expiresAt,
  }
}

export async function logout({ refreshToken, allDevices = false, userId = null }) {
  if (allDevices && userId) {
    await revokeAllSessions(userId)
  } else {
    await revokeRefreshToken(refreshToken)
  }
  return { success: true }
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  assertPasswordStrength(newPassword)

  const user = unwrap(
    await supabase.from("users").select("id, password_hash").eq("id", userId).single(),
    "Loading user for password change",
  )

  // Google-only accounts have no password to verify, so they may set one for
  // the first time without supplying a current password.
  if (user.password_hash) {
    const matches = await bcrypt.compare(String(currentPassword || ""), user.password_hash)
    if (!matches) throw unauthorized("Current password is incorrect")
  }

  unwrap(
    await supabase
      .from("users")
      .update({ password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) })
      .eq("id", userId)
      .select("id")
      .single(),
    "Updating password",
  )

  // A credential change invalidates every existing session, so a stolen one
  // cannot outlive the password it was created with.
  await revokeAllSessions(userId)

  return { success: true }
}
