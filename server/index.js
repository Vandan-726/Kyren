/**
 * Local development entry point.
 *
 * On Vercel the app is served by `api/index.js` instead, so nothing in this
 * file runs in production. Keep deployment-relevant behaviour in `app.js`.
 */

import app from "./app.js"
import { env } from "./config/env.js"
import { startInlinePoller } from "./worker/poller.js"

const server = app.listen(env.port, () => {
  console.log(`[v0] KYREN API listening on http://localhost:${env.port}`)
})

// Optional in-process job poller for local development, so course generation
// completes without a separate cron trigger.
const stopPoller = startInlinePoller()

function shutdown(signal) {
  console.log(`[v0] ${signal} received, shutting down`)
  stopPoller?.()
  server.close(() => process.exit(0))
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
