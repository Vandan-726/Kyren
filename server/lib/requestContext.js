import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Ambient per-request context.
 *
 * Why this exists: every Grok call should be attributed to the user who caused
 * it, so the analytics dashboard and cost reports are meaningful. Threading a
 * `userId` argument through all 16 agent functions (and the job handlers that
 * call them) would mean touching every signature and would silently regress the
 * moment someone forgot to pass it along.
 *
 * AsyncLocalStorage keeps the value attached to the async execution chain
 * instead, so an agent nested three calls deep still knows who it is working
 * for, and a background job with no owner simply sees null.
 */
const storage = new AsyncLocalStorage()

/** Runs `fn` with the given context bound to the current async chain. */
export function runWithContext(context, fn) {
  return storage.run({ ...context }, fn)
}

/** Returns the active context, or an empty object outside any request/job. */
export function getContext() {
  return storage.getStore() ?? {}
}

/** Convenience accessor used by the xAI client for usage attribution. */
export function getContextUserId() {
  return storage.getStore()?.userId ?? null
}

/**
 * Express middleware that binds the authenticated user id for the rest of the
 * request. Must run AFTER auth resolution so req.user is populated.
 */
export function requestContextMiddleware(req, res, next) {
  runWithContext({ userId: req.user?.id ?? null, requestId: req.id ?? null }, next)
}
