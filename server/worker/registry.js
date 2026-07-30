/**
 * Job handler registry.
 *
 * Handlers live in their own modules and register themselves here, which keeps
 * the runner free of imports for every feature and avoids import cycles
 * (a handler may need to enqueue follow-up jobs).
 *
 * A handler receives the claimed job row and returns a JSON-serializable
 * result that is stored on the job and polled by the client.
 */

/** @type {Map<string, (job: object) => Promise<unknown>>} */
const handlers = new Map()

export function registerHandler(type, handler) {
  if (handlers.has(type)) {
    throw new Error(`Job handler already registered for type "${type}"`)
  }
  handlers.set(type, handler)
}

export function getHandler(type) {
  return handlers.get(type)
}

export function registeredTypes() {
  return [...handlers.keys()]
}
