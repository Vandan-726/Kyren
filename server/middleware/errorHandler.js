/**
 * Terminal error middleware plus the 404 fallback.
 *
 * Expected failures (AppError) pass their message through to the client.
 * Everything else is logged in full server-side and reduced to a generic 500
 * for the client so internals never leak.
 */

import { env } from "../config/env.js"
import { fail } from "../utils/respond.js"

export function notFoundHandler(req, res) {
  return fail(
    res,
    404,
    "route_not_found",
    `No route matches ${req.method} ${req.originalUrl}`,
  )
}

 
export function errorHandler(err, req, res, next) {
  // Malformed JSON body produced by express.json().
  if (err?.type === "entity.parse.failed") {
    return fail(res, 400, "invalid_json", "Request body is not valid JSON")
  }
  if (err?.type === "entity.too.large") {
    return fail(res, 413, "payload_too_large", "Request body is too large")
  }

  if (err?.expected) {
    if (err.status >= 500) {
      console.error(`[v0] ${err.code} on ${req.method} ${req.originalUrl}:`, err.message)
    }
    return fail(res, err.status, err.code, err.message, err.details)
  }

  console.error(
    `[v0] Unhandled error on ${req.method} ${req.originalUrl}:`,
    err?.stack || err,
  )

  return fail(
    res,
    err?.status && err.status < 500 ? err.status : 500,
    "internal_error",
    env.isProduction 
      ? "An unexpected error occurred. Please try again." 
      : `Internal Server Error: ${err?.message || "Unknown error"}\n${err?.stack || ""}`,
    env.isProduction ? undefined : { message: err?.message, stack: err?.stack },
  )
}
