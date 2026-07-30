/**
 * Job runner.
 *
 * `drainJobs` claims and executes up to `max` jobs sequentially, then returns.
 * It is deliberately bounded rather than looping forever so the same function
 * works from a serverless cron invocation (which has a wall-clock budget) and
 * from the local in-process poller.
 */

import { claimNextJob, completeJob, failJob } from "../services/jobQueue.js"
import { getHandler } from "./registry.js"
// Importing the handler modules is what populates the registry.
import "./handlers/index.js"

/**
 * @param {object} [options]
 * @param {number} [options.max] Maximum jobs to process in this drain.
 * @param {number} [options.budgetMs] Stop claiming new jobs after this long.
 */
export async function drainJobs({ max = 3, budgetMs = 240000 } = {}) {
  const startedAt = Date.now()
  const processed = []

  for (let i = 0; i < max; i += 1) {
    if (Date.now() - startedAt > budgetMs) break

    let job
    try {
      job = await claimNextJob()
    } catch (err) {
      console.error("[v0] Failed to claim job:", err.message)
      break
    }

    if (!job) break

    const handler = getHandler(job.type)

    if (!handler) {
      // Unknown type is a deployment bug, not a transient fault. Burn the
      // remaining attempts immediately so it lands in `failed` and is visible.
      await failJob(job.id, `No handler registered for job type "${job.type}"`)
      processed.push({ id: job.id, type: job.type, status: "failed" })
      continue
    }

    try {
      const result = await handler(job)
      await completeJob(job.id, result ?? null)
      processed.push({ id: job.id, type: job.type, status: "succeeded" })
    } catch (err) {
      console.error(`[v0] Job ${job.id} (${job.type}) failed:`, err.message)
      const updated = await failJob(job.id, err)
      processed.push({ id: job.id, type: job.type, status: updated.status })
    }
  }

  return {
    processed,
    count: processed.length,
    durationMs: Date.now() - startedAt,
  }
}
