/**
 * Durable job queue backed by the `generation_jobs` table.
 *
 * Why a queue at all: generating a course calls xAI several times and YouTube
 * once per lesson, which routinely exceeds a serverless request budget. The
 * HTTP handler therefore enqueues a job and returns immediately; the client
 * polls the job until it reports `succeeded`.
 *
 * Claiming uses the `claim_next_job()` Postgres function, which does
 * `FOR UPDATE SKIP LOCKED` inside a transaction. That is what makes it safe to
 * run several workers concurrently without two of them picking up the same row.
 */

import { supabase, unwrap } from "../config/supabase.js"
import { notFound } from "../utils/errors.js"

export const JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
}

/** Backoff for retries: 15s, 60s, 240s. */
const backoffMs = (attempts) => Math.min(15000 * 4 ** (attempts - 1), 240000)

/**
 * Adds a job to the queue.
 *
 * @param {object} args
 * @param {string} args.type Handler key, e.g. `course.generate`.
 * @param {string|null} args.userId Owner; used for scoping status reads.
 * @param {object} [args.payload] Arbitrary JSON input for the handler.
 * @param {number} [args.maxAttempts]
 */
export async function enqueueJob({
  type,
  userId,
  payload = {},
  maxAttempts = 3,
}) {
  return unwrap(
    await supabase
      .from("generation_jobs")
      .insert({
        type,
        user_id: userId ?? null,
        payload,
        max_attempts: maxAttempts,
        status: JOB_STATUS.QUEUED,
      })
      .select("id, type, status, created_at")
      .single(),
    "Enqueueing job",
  )
}

/**
 * Atomically claims the next runnable job, or returns null when the queue is
 * empty. The claim also increments `attempts`, so a job that crashes the
 * process mid-run still counts as an attempt and cannot loop forever.
 */
export async function claimNextJob() {
  const { data, error } = await supabase.rpc("claim_next_job")
  if (error) {
    throw new Error(`Claiming job failed: ${error.message}`)
  }
  // The RPC returns a record; supabase-js may surface it as an array.
  const job = Array.isArray(data) ? data[0] : data
  return job?.id ? job : null
}

export async function completeJob(jobId, result) {
  return unwrap(
    await supabase
      .from("generation_jobs")
      .update({
        status: JOB_STATUS.SUCCEEDED,
        result: result ?? null,
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("id, status, result")
      .single(),
    "Completing job",
  )
}

/**
 * Records a failure. If attempts remain the job returns to `queued` with a
 * delayed `run_after`; otherwise it is marked permanently `failed`.
 */
export async function failJob(jobId, error) {
  const job = unwrap(
    await supabase
      .from("generation_jobs")
      .select("id, attempts, max_attempts")
      .eq("id", jobId)
      .single(),
    "Loading job for failure handling",
  )

  const exhausted = job.attempts >= job.max_attempts
  const message = String(error?.message ?? error).slice(0, 2000)

  return unwrap(
    await supabase
      .from("generation_jobs")
      .update({
        status: exhausted ? JOB_STATUS.FAILED : JOB_STATUS.QUEUED,
        error: message,
        finished_at: exhausted ? new Date().toISOString() : null,
        run_after: exhausted
          ? new Date().toISOString()
          : new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
      })
      .eq("id", jobId)
      .select("id, status, error, attempts, max_attempts")
      .single(),
    "Failing job",
  )
}

/**
 * Reads a job for the polling client. Scoped by `userId` so one learner can
 * never observe another learner's generation payloads.
 */
export async function getJobForUser(jobId, userId) {
  const job = unwrap(
    await supabase
      .from("generation_jobs")
      .select(
        "id, type, status, result, error, attempts, max_attempts, created_at, started_at, finished_at",
      )
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle(),
    "Loading job",
  )

  if (!job) throw notFound("Job not found")
  return job
}

/** Lists a user's recent jobs, newest first. */
export async function listJobsForUser(userId, { type, status, limit = 20 } = {}) {
  let query = supabase
    .from("generation_jobs")
    .select("id, type, status, error, created_at, finished_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (type) query = query.eq("type", type)
  if (status) query = query.eq("status", status)

  return unwrap(await query, "Listing jobs")
}
