/**
 * Typed application errors.
 *
 * Anything thrown as an `AppError` is treated as an expected, client-facing
 * failure: the message is safe to show and the status code is honoured. Any
 * other thrown value is treated as a bug and reported as a generic 500 so we
 * never leak stack traces or database internals to the client.
 */

export class AppError extends Error {
  constructor(message, status = 500, code = "internal_error", details) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.code = code
    this.details = details
    this.expected = true
  }
}

export const badRequest = (message, details) =>
  new AppError(message, 400, "bad_request", details)

export const unauthorized = (message = "Authentication required") =>
  new AppError(message, 401, "unauthorized")

export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(message, 403, "forbidden")

export const notFound = (message = "Resource not found") =>
  new AppError(message, 404, "not_found")

export const conflict = (message, details) =>
  new AppError(message, 409, "conflict", details)

export const tooManyRequests = (message = "Too many requests") =>
  new AppError(message, 429, "rate_limited")

export const serviceUnavailable = (message, details) =>
  new AppError(message, 503, "service_unavailable", details)

/**
 * Raised when an optional integration (xAI, Sarvam, Firebase, YouTube) is
 * referenced but its credentials are absent. Returns 503 with an actionable
 * message rather than a confusing 500.
 */
export const notConfigured = (service, envVars) =>
  new AppError(
    `${service} is not configured on this deployment.`,
    503,
    "not_configured",
    { service, requiredEnvVars: envVars },
  )

/**
 * Wraps an async route handler so rejected promises reach the error
 * middleware. Express 5 does this natively, but the explicit wrapper keeps
 * behaviour identical if the app is ever downgraded and documents intent.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
