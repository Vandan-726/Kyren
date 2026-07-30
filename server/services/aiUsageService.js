/**
 * AI cost and quota accounting.
 *
 * `recordUsage` is deliberately failure-tolerant: a logging outage must never
 * turn a successful generation into an error for the student. Quota checks, by
 * contrast, are strict — they are the durable spend ceiling that survives
 * process restarts, unlike the in-memory rate limiter.
 */

import { supabase } from "../config/supabase.js"
import { tooManyRequests } from "../utils/errors.js"

/** Daily per-user ceilings. Generation is capped hardest: it fans out. */
const DAILY_LIMITS = {
  total: 300,
  course_generation: 15,
  quiz_generation: 60,
}

function startOfUtcDay() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/**
 * Writes one usage row. Never throws.
 * @returns {Promise<void>}
 */
export async function recordUsage({
  userId = null,
  provider,
  endpoint = null,
  model = null,
  requestType = null,
  promptTokens = null,
  completionTokens = null,
  totalTokens = null,
  costEstimate = null,
  status = "success",
  errorMessage = null,
  processingTimeMs = null,
}) {
  try {
    await supabase.from("ai_api_usage").insert({
      user_id: userId,
      api_provider: provider,
      api_endpoint: endpoint,
      model,
      request_type: requestType,
      prompt_tokens: promptTokens ?? null,
      completion_tokens: completionTokens ?? null,
      // Prefer the provider's own total; otherwise derive it from the parts.
      // A derived 0 means "we genuinely have no token data", so store null
      // rather than a misleading zero that would skew cost aggregates.
      tokens_used: totalTokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0) || null),
      cost_estimate: costEstimate,
      request_status: status,
      error_message: errorMessage,
      processing_time_ms: processingTimeMs,
    })
  } catch (error) {
    // Observability failure, not a request failure.
    console.error("[v0] Failed to record AI usage:", error.message)
  }
}

/**
 * Enforces the durable daily quota before an expensive call is made.
 * Only successful calls count, so a provider outage cannot burn a user's quota.
 *
 * @param {string} userId
 * @param {string} [requestType] When given, also enforces that type's sub-limit.
 */
export async function assertWithinDailyQuota(userId, requestType) {
  if (!userId) return

  const since = startOfUtcDay()

  const { count: total, error } = await supabase
    .from("ai_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("request_status", "success")
    .gte("created_at", since)

  // Fail open: if accounting is unavailable, the in-memory rate limiter and
  // provider-side limits still apply. Blocking all learning would be worse.
  if (error) {
    console.error("[v0] Quota check failed, allowing request:", error.message)
    return
  }

  if ((total ?? 0) >= DAILY_LIMITS.total) {
    throw tooManyRequests("You have reached today's AI usage limit. It resets at midnight UTC.")
  }

  const typeLimit = DAILY_LIMITS[requestType]
  if (!typeLimit) return

  const { count: typeCount } = await supabase
    .from("ai_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("request_type", requestType)
    .eq("request_status", "success")
    .gte("created_at", since)

  if ((typeCount ?? 0) >= typeLimit) {
    throw tooManyRequests(
      `You have reached today's limit for this action (${typeLimit}). It resets at midnight UTC.`,
    )
  }
}

/** Usage summary for the settings screen and admin dashboard. */
export async function getUsageSummary(userId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("ai_api_usage")
    .select("api_provider, request_type, request_status, tokens_used, cost_estimate, processing_time_ms, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)

  if (error) throw error

  const rows = data ?? []
  const successful = rows.filter((row) => row.request_status === "success")

  const byType = {}
  for (const row of rows) {
    const key = row.request_type ?? "unknown"
    byType[key] = (byType[key] ?? 0) + 1
  }

  const latencies = successful.map((row) => row.processing_time_ms).filter((value) => typeof value === "number")

  return {
    windowDays: days,
    totalRequests: rows.length,
    successfulRequests: successful.length,
    failedRequests: rows.length - successful.length,
    totalTokens: successful.reduce((sum, row) => sum + (row.tokens_used ?? 0), 0),
    estimatedCostUsd: Number(successful.reduce((sum, row) => sum + Number(row.cost_estimate ?? 0), 0).toFixed(4)),
    averageLatencyMs:
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    byType,
    dailyLimits: DAILY_LIMITS,
  }
}

export { DAILY_LIMITS }
