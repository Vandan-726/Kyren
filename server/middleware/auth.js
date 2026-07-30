/**
 * Authentication and authorization middleware.
 *
 * `requireAuth` is the boundary that turns a bearer token into `req.user`.
 * Every downstream service scopes its queries by `req.user.id`, so this is the
 * only place the caller's identity is established — never trust a `user_id`
 * that arrives in a request body.
 */

import { supabase, unwrap } from "../config/supabase.js"
import { verifyAccessToken } from "../services/tokenService.js"
import { unauthorized, forbidden } from "../utils/errors.js"

function extractBearer(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  return token.length > 0 ? token : null
}

/**
 * Resolves the caller and attaches the full user row to `req.user`.
 *
 * The row is re-read on every request (rather than trusted from the JWT claims)
 * so that deactivations, role changes, and onboarding updates take effect
 * immediately instead of at the next token refresh.
 */
export async function requireAuth(req, _res, next) {
  try {
    // `optionalAuth` runs app-wide and may have already resolved the caller.
    // Reuse that result so a request never costs two user lookups.
    if (req.user) return next()

    const token = extractBearer(req)
    if (!token) throw unauthorized("Missing Authorization bearer token")

    const claims = verifyAccessToken(token)

    const user = unwrap(
      await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, avatar_url, role, is_active, " +
            "onboarding_completed, is_verified, created_at",
        )
        .eq("id", claims.sub)
        .maybeSingle(),
      "Loading authenticated user",
    )

    if (!user) throw unauthorized("Account no longer exists")
    if (!user.is_active) throw unauthorized("This account has been deactivated")

    req.user = user
    req.accessTokenClaims = claims
    return next()
  } catch (err) {
    return next(err)
  }
}

/**
 * Attaches `req.user` when a valid token is present but never rejects.
 * Used by endpoints that personalize their response for signed-in callers
 * while remaining publicly readable.
 */
export async function optionalAuth(req, res, next) {
  if (!extractBearer(req)) return next()
  try {
    await requireAuth(req, res, (err) => {
      if (err) {
        req.user = undefined
        return next()
      }
      return next()
    })
  } catch {
    req.user = undefined
    return next()
  }
}

/**
 * Restricts a route to the listed roles. Must run after `requireAuth`.
 * @param {...('student'|'teacher'|'admin')} roles
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) {
      return next(
        forbidden(`This action requires one of the following roles: ${roles.join(", ")}`),
      )
    }
    return next()
  }
}

export const requireAdmin = requireRole("admin")
export const requireTeacher = requireRole("teacher", "admin")

/**
 * Guards the cron/worker endpoints with a shared secret. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; we also accept `x-cron-secret` for
 * manual triggering.
 */
export function requireCronSecret(req, _res, next) {
  // Lazy import avoids a cycle: env -> supabase -> tokenService -> auth.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return next(forbidden("Worker endpoints are disabled: CRON_SECRET is not set"))
  }

  const provided = extractBearer(req) || req.headers["x-cron-secret"]
  if (provided !== secret) return next(forbidden("Invalid worker credentials"))

  return next()
}
