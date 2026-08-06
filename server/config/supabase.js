/**
 * Supabase service-role client.
 *
 * RLS is intentionally not used as the authorization boundary in KYREN:
 * requests never carry a Supabase JWT, they carry OUR access token. Express
 * resolves the caller, then every query is scoped by `user_id` in the service
 * layer. That makes this module the single most security-sensitive file in the
 * backend — the client below can read and write every row in the database.
 *
 * Rules:
 *   1. Never import this from anything under `src/` (the browser bundle).
 *   2. Never build a query without a `user_id` filter for user-owned tables,
 *      unless the caller has already been verified as an admin.
 */

import { createClient } from "@supabase/supabase-js"
import { env, assertRequiredEnv } from "./env.js"

assertRequiredEnv()

export const supabase = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: {
      // No cookie/session handling: this is a stateless server-side client.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "kyren-backend" },
    },
  },
)

/**
 * Unwraps a Supabase result, converting `{ error }` into a thrown Error so
 * route handlers can rely on try/catch instead of checking every response.
 *
 * @template T
 * @param {{ data: T, error: import('@supabase/supabase-js').PostgrestError | null }} result
 * @param {string} context Human-readable description used in the error message.
 * @returns {T}
 */
export function unwrap(result, context = "database query") {
  if (result.error) {
    const rawMsg = String(result.error?.message || "")
    const isHtml = rawMsg.includes("<!DOCTYPE") || rawMsg.includes("<html") || rawMsg.includes("<head")
    const isTimeout = isHtml || rawMsg.includes("522") || rawMsg.includes("502") || rawMsg.includes("503") || rawMsg.includes("504") || rawMsg.includes("ETIMEDOUT")

    const cleanMsg = isTimeout
      ? "Database service is temporarily unreachable (connection timed out). Please try again in a few moments."
      : rawMsg

    const err = new Error(`${context} failed: ${cleanMsg}`)
    err.status = isTimeout ? 503 : 500
    err.code = isTimeout ? "service_unavailable" : (result.error.code || "database_error")
    err.details = isHtml ? { isHtmlError: true } : result.error.details
    err.expected = true
    throw err
  }
  return result.data
}
