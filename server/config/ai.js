/**
 * Unified AI (Gemini & Groq) client.
 *
 * Exposes a similar OpenAI-compatible chat endpoint. Uses Gemini or Groq based on
 * configuration and environment variables.
 */

import { env, isGroqConfigured, isGeminiConfigured } from "./env.js"
import { notConfigured, serviceUnavailable } from "../utils/errors.js"
import { recordUsage } from "../services/aiUsageService.js"
import { getContextUserId } from "../lib/requestContext.js"

const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

/** Cost attribution estimates per million tokens. */
const COST_PER_MILLION = {
  groq: { prompt: 3.0, completion: 15.0 }, // Blend for llama-3.3-70b class
  gemini: { prompt: 0.075, completion: 0.3 }, // Blend for gemini-2.5-flash
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function estimateCost(usage, provider) {
  if (!usage) return null
  const rates = COST_PER_MILLION[provider] || COST_PER_MILLION.gemini
  const prompt = (usage.prompt_tokens ?? 0) / 1_000_000
  const completion = (usage.completion_tokens ?? 0) / 1_000_000
  return Number((prompt * rates.prompt + completion * rates.completion).toFixed(6))
}

/**
 * Recovers JSON wrapped in prose or markdown blocks.
 */
function parseJsonLoosely(text) {
  const trimmed = String(text ?? "").trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Keep trying
    }
  }

  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1))
    } catch {
      // Give up
    }
  }

  throw serviceUnavailable("The AI returned a response that could not be parsed as JSON.")
}

/**
 * Single chat completion request against either Gemini or Groq.
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
  // Determine which provider to use
  let activeProvider = env.ai.provider

  // Auto-failover if the chosen provider isn't configured but the other is
  if (activeProvider === "gemini" && !isGeminiConfigured() && isGroqConfigured()) {
    activeProvider = "groq"
  } else if (activeProvider === "groq" && !isGroqConfigured() && isGeminiConfigured()) {
    activeProvider = "gemini"
  }

  // Final check to make sure the active provider is configured
  if (activeProvider === "gemini" && !isGeminiConfigured()) {
    throw notConfigured("Gemini API", ["GEMINI_API_KEY"])
  }
  if (activeProvider === "groq" && !isGroqConfigured()) {
    throw notConfigured("Groq API", ["GROQ_API_KEY"])
  }

  const isGemini = activeProvider === "gemini"
  const apiKey = isGemini ? env.ai.geminiApiKey : env.ai.groqApiKey
  const baseUrl = isGemini ? env.ai.geminiBaseUrl : env.ai.groqBaseUrl
  const model = fast
    ? (isGemini ? env.ai.geminiFastModel : env.ai.groqFastModel)
    : (isGemini ? env.ai.geminiModel : env.ai.groqModel)

  const attributedUserId = userId ?? getContextUserId()

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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs)

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        const error = new Error(`${isGemini ? "Gemini" : "Groq"} responded ${response.status}: ${detail.slice(0, 300)}`)
        error.status = response.status
        throw error
      }

      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content

      if (!content) {
        throw new Error(`${isGemini ? "Gemini" : "Groq"} returned an empty completion`)
      }

      const elapsed = Date.now() - startedAt

      void recordUsage({
        userId: attributedUserId,
        provider: activeProvider,
        endpoint: "/chat/completions",
        model,
        requestType,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
        costEstimate: estimateCost(payload.usage, activeProvider),
        status: "success",
        processingTimeMs: elapsed,
      })

      return schema ? parseJsonLoosely(content) : content.trim()
    } catch (error) {
      lastError = error

      const isAbort = error.name === "AbortError"
      const retryable = isAbort || RETRYABLE_STATUS.has(error.status) || error.status === undefined

      if (attempt === MAX_ATTEMPTS || !retryable) break

      const backoff = 500 * 2 ** (attempt - 1)
      await sleep(backoff + Math.random() * 250)
    } finally {
      clearTimeout(timer)
    }
  }

  const isTimeout = lastError?.name === "AbortError"

  void recordUsage({
    userId: attributedUserId,
    provider: activeProvider,
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

export function chatJson(options) {
  if (!options.schema) throw new Error("chatJson requires a schema")
  return chat(options)
}
