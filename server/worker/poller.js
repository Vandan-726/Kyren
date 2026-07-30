/**
 * In-process job poller for local development.
 *
 * Production uses Vercel Cron hitting `POST /api/jobs/drain`, because a
 * serverless function cannot hold a long-lived interval. Locally there is no
 * cron, so this keeps generation flowing during development.
 *
 * Enable with `WORKER_INLINE_POLLER=true`.
 */

import { env } from "../config/env.js"
import { drainJobs } from "./runner.js"

export function startInlinePoller() {
  if (!env.worker.inlinePoller) return undefined

  let running = false
  let stopped = false

  const tick = async () => {
    // Guard against overlapping runs: a slow generation must not cause the
    // interval to stack up concurrent drains.
    if (running || stopped) return
    running = true
    try {
      const result = await drainJobs({ max: env.worker.maxJobsPerDrain })
      if (result.count > 0) {
        console.log(`[v0] Poller processed ${result.count} job(s)`)
      }
    } catch (err) {
      console.error("[v0] Poller error:", err.message)
    } finally {
      running = false
    }
  }

  const interval = setInterval(tick, env.worker.pollIntervalMs)
  interval.unref?.()

  console.log(
    `[v0] Inline job poller started (every ${env.worker.pollIntervalMs}ms)`,
  )

  return () => {
    stopped = true
    clearInterval(interval)
  }
}
