/**
 * Sarvam AI client — vernacular speech and translation.
 *
 * Runs server-side only so SARVAM_API_KEY never reaches the browser. The
 * frontend talks to /api/voice/* instead, which proxies to here.
 *
 * Sarvam has hard input limits (TTS ~500 chars/request, translate ~1000), so
 * this module chunks long text rather than letting the upstream 400.
 */

import { env, isSarvamConfigured } from "../config/env.js"
import { notConfigured, serviceUnavailable, badRequest } from "../utils/errors.js"
import { recordUsage } from "./aiUsageService.js"
import { getContextUserId } from "../lib/requestContext.js"

// KYREN language code -> Sarvam BCP-47 tag.
//
// Note: Odia is "or" in our skills graph and ISO 639-1; Sarvam expects "od-IN".
// Both spellings are accepted here so a stray "od" from older client code still
// resolves instead of silently falling back to English.
const SARVAM_LANG_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  or: "od-IN",
  od: "od-IN",
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN",
  as: "as-IN",
}

/** Sarvam's per-request text ceilings. Exceeding these returns a 400. */
const TTS_CHAR_LIMIT = 480
const TRANSLATE_CHAR_LIMIT = 950

const TIMEOUT_MS = 30_000

export function toSarvamLang(code) {
  return SARVAM_LANG_MAP[code] || "en-IN"
}

export function isSupportedLanguage(code) {
  return Boolean(SARVAM_LANG_MAP[code])
}

/**
 * Splits text on sentence boundaries so each chunk stays under `limit`.
 * Splitting mid-sentence makes TTS audio audibly wrong at the seams, so we
 * prefer sentence ends and only hard-split words that are pathologically long.
 */
function chunkText(text, limit) {
  const clean = text.trim()
  if (clean.length <= limit) return [clean]

  const chunks = []
  // Keep the delimiter attached, and include Devanagari danda (।) which ends
  // sentences in Hindi/Marathi/Bengali and would otherwise never split.
  const sentences = clean.split(/(?<=[.!?।])\s+/)

  let current = ""
  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      for (let i = 0; i < sentence.length; i += limit) {
        chunks.push(sentence.slice(i, i + limit))
      }
      continue
    }

    if (`${current} ${sentence}`.trim().length > limit) {
      if (current) chunks.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * Single Sarvam request with timeout and usage logging.
 *
 * `body` is either a plain object (sent as JSON) or a FormData instance (sent
 * as multipart, letting fetch set the boundary header itself).
 */
async function sarvamFetch(path, body, { requestType, isMultipart = false }) {
  if (!isSarvamConfigured()) {
    throw notConfigured("Sarvam AI", ["SARVAM_API_KEY"])
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()
  const userId = getContextUserId()

  const headers = { "api-subscription-key": env.sarvam.apiKey }
  if (!isMultipart) headers["Content-Type"] = "application/json"

  try {
    const response = await fetch(`${env.sarvam.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: isMultipart ? body : JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      const error = new Error(`Sarvam responded ${response.status}: ${detail.slice(0, 300)}`)
      error.status = response.status
      throw error
    }

    const payload = await response.json()

    void recordUsage({
      userId,
      provider: "sarvam",
      endpoint: path,
      requestType,
      status: "success",
      processingTimeMs: Date.now() - startedAt,
    })

    return payload
  } catch (error) {
    const isTimeout = error.name === "AbortError"

    void recordUsage({
      userId,
      provider: "sarvam",
      endpoint: path,
      requestType,
      status: isTimeout ? "timeout" : "failed",
      errorMessage: error.message?.slice(0, 1000),
      processingTimeMs: Date.now() - startedAt,
    })

    // A 4xx means the caller sent something invalid; surface that distinctly
    // from an upstream outage so the client can correct it rather than retry.
    if (error.status >= 400 && error.status < 500) {
      throw badRequest(`Voice service rejected the request: ${error.message.slice(0, 200)}`)
    }

    throw serviceUnavailable(
      isTimeout
        ? "The voice service timed out. Please try again."
        : "The voice service is temporarily unavailable.",
      { cause: error.message?.slice(0, 200) },
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Speech-to-text.
 *
 * @param {Buffer} audioBuffer raw audio bytes from the upload
 * @param {string} filename    original name, used for the multipart part
 * @param {string} mimeType    e.g. "audio/webm"
 * @param {string} langCode    KYREN language code; "auto" lets Sarvam detect
 * @returns {Promise<{transcript: string, languageCode: string}>}
 */
export async function speechToText(audioBuffer, { filename = "audio.webm", mimeType = "audio/webm", langCode = "en" } = {}) {
  const form = new FormData()
  form.append("file", new Blob([audioBuffer], { type: mimeType }), filename)

  // Omitting language_code entirely triggers Sarvam's auto-detection, which is
  // what we want for a code-mixed Hinglish learner.
  if (langCode && langCode !== "auto") {
    form.append("language_code", toSarvamLang(langCode))
  }

  const data = await sarvamFetch("/speech-to-text", form, {
    requestType: "Speech to Text",
    isMultipart: true,
  })

  return {
    transcript: data.transcript ?? "",
    languageCode: data.language_code ?? toSarvamLang(langCode),
  }
}

/**
 * Text-to-speech. Returns base64 WAV chunks in playback order.
 *
 * Long text is chunked and requested sequentially. Sequential rather than
 * parallel is deliberate: Sarvam rate-limits aggressively, and a burst of
 * parallel chunks for one paragraph reliably trips it.
 */
export async function textToSpeech(text, { langCode = "en", speaker = null } = {}) {
  if (!text?.trim()) throw badRequest("Text is required for speech synthesis")

  const targetLang = toSarvamLang(langCode)
  const chunks = chunkText(text, TTS_CHAR_LIMIT)
  const audios = []

  for (const chunk of chunks) {
    const body = {
      inputs: [chunk],
      target_language_code: targetLang,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
    }
    if (speaker) body.speaker = speaker

    const data = await sarvamFetch("/text-to-speech", body, { requestType: "Text to Speech" })
    if (data.audios?.length) audios.push(...data.audios)
  }

  if (!audios.length) throw serviceUnavailable("The voice service returned no audio")

  return { audios, languageCode: targetLang, chunkCount: chunks.length }
}

/**
 * Translation. Chunked the same way as TTS, then rejoined.
 */
export async function translateText(text, { targetLangCode = "en", sourceLangCode = "auto" } = {}) {
  if (!text?.trim()) throw badRequest("Text is required for translation")

  const source = sourceLangCode === "auto" ? "auto" : toSarvamLang(sourceLangCode)
  const target = toSarvamLang(targetLangCode)

  // Nothing to do when both ends are the same language.
  if (source === target) {
    return { translated: text, sourceLanguageCode: source, targetLanguageCode: target }
  }

  const chunks = chunkText(text, TRANSLATE_CHAR_LIMIT)
  const parts = []

  for (const chunk of chunks) {
    const data = await sarvamFetch(
      "/translate",
      {
        input: chunk,
        source_language_code: source,
        target_language_code: target,
        mode: "formal",
        enable_preprocessing: true,
      },
      { requestType: "Translation" },
    )

    parts.push(data.translated_text ?? data.translations?.[0] ?? "")
  }

  return {
    translated: parts.join(" ").trim(),
    sourceLanguageCode: source,
    targetLanguageCode: target,
  }
}

export { isSarvamConfigured }
