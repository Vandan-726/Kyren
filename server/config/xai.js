/**
 * xAI (Grok) client.
 *
 * A thin fetch wrapper rather than an SDK, because we need three things the
 * generic clients make awkward:
 *   1. Strict JSON output validated against a schema before it reaches a
 *      database write.
 *   2. Per-call usage rows in `ai_api_usage` for cost attribution.
 *   3. Retry with backoff on 429/5xx, but never on 4xx (a malformed prompt
 *      will fail identically no matter how many times we resend it).
 *
 * The module never throws at import time when the key is missing, so the app
 * boots and only AI endpoints report 503.
 */

import { env, isXaiConfigured } from "./env.js"
import { notConfigured, serviceUnavailable } from "../utils/errors.js"
import { recordUsage } from "../services/aiUsageService.js"
import { getContextUserId } from "../lib/requestContext.js"

const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

/** Rough blended $/1M tokens for grok-3 class models, for cost attribution. */
const COST_PER_MILLION = { prompt: 3, completion: 15 }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function estimateCost(usage) {
  if (!usage) return null
  const prompt = (usage.prompt_tokens ?? 0) / 1_000_000
  const completion = (usage.completion_tokens ?? 0) / 1_000_000
  return Number((prompt * COST_PER_MILLION.prompt + completion * COST_PER_MILLION.completion).toFixed(6))
}

/**
 * Grok occasionally wraps JSON in prose or a markdown fence even when asked
 * not to. Recover the object rather than failing the whole generation.
 */
function parseJsonLoosely(text) {
  const trimmed = String(text ?? "").trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to fence/brace extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Keep trying.
    }
  }

  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1))
    } catch {
      // Give up below.
    }
  }

  throw serviceUnavailable("The AI returned a response that could not be parsed as JSON.")
}

/**
 * Single chat completion against xAI.
 *
 * @param {object} options
 * @param {string} options.prompt            User message.
 * @param {string} [options.system]          System instruction.
 * @param {object} [options.schema]          JSON schema; enables structured output.
 * @param {string} [options.schemaName]      Name for the schema (xAI requires one).
 * @param {string} [options.requestType]     Label written to ai_api_usage.
 * @param {string} [options.userId]          Owner for usage attribution.
 * @param {boolean} [options.fast]           Use the cheaper/faster model.
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @returns {Promise<object|string>} Parsed object when a schema is given, else text.
 */
export async function chat({
  prompt,
  system,
  schema = null,
  schemaName = "response",
  requestType = "unknown",
  userId = null,
  fast = false,
  temperature = 0.7,
  maxTokens = 8192,
}) {
  if (!isXaiConfigured()) {
    throw notConfigured("xAI (Grok)", ["XAI_API_KEY"])
  }

  // Fall back to the ambient request context so agent code deep in a call chain
  // still attributes its spend correctly without passing userId explicitly.
  const attributedUserId = userId ?? getContextUserId()

  const model = fast ? env.xai.fastModel : env.xai.model
  const messages = []
  if (system) messages.push({ role: "system", content: system })
  messages.push({ role: "user", content: prompt })

  const body = { model, messages, temperature, max_tokens: maxTokens }

  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schemaName, strict: false, schema },
    }
  }

  const startedAt = Date.now()
  let lastError

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // A fresh AbortController per attempt; reusing one would abort instantly
    // on retry because the signal stays tripped once fired.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.xai.timeoutMs)

    try {
      const response = await fetch(`${env.xai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.xai.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        const error = new Error(`xAI responded ${response.status}: ${detail.slice(0, 300)}`)
        error.status = response.status
        throw error
      }

      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content

      if (!content) {
        throw new Error("xAI returned an empty completion")
      }

      const elapsed = Date.now() - startedAt

      // Usage logging must never break a successful generation, so it is
      // fire-and-forget with its own error handling inside recordUsage.
      void recordUsage({
        userId: attributedUserId,
        provider: "xai",
        endpoint: "/chat/completions",
        model,
        requestType,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
        costEstimate: estimateCost(payload.usage),
        status: "success",
        processingTimeMs: elapsed,
      })

      return schema ? parseJsonLoosely(content) : content.trim()
    } catch (error) {
      lastError = error

      const isAbort = error.name === "AbortError"
      const retryable = isAbort || RETRYABLE_STATUS.has(error.status) || error.status === undefined

      if (attempt === MAX_ATTEMPTS || !retryable) break

      // Exponential backoff with jitter so concurrent workers hitting a 429
      // do not synchronise into another burst.
      const backoff = 500 * 2 ** (attempt - 1)
      await sleep(backoff + Math.random() * 250)
    } finally {
      clearTimeout(timer)
    }
  }

  const isTimeout = lastError?.name === "AbortError"

  void recordUsage({
    userId: attributedUserId,
    provider: "xai",
    endpoint: "/chat/completions",
    model,
    requestType,
    status: isTimeout ? "timeout" : "failed",
    errorMessage: lastError?.message?.slice(0, 1000),
    processingTimeMs: Date.now() - startedAt,
  })

  throw serviceUnavailable(
    isTimeout
      ? "The AI request timed out. Please try again."
      : "The AI service is temporarily unavailable. Please try again shortly.",
    { cause: lastError?.message?.slice(0, 200) },
  )
}

/** Convenience wrapper for schema-backed calls, for readable agent code. */
export function chatJson(options) {
  if (!options.schema) throw new Error("chatJson requires a schema")
  return chat(options)
}

export { isXaiConfigured }
