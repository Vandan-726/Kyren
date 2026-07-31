/**
 * Voice + translation endpoints, proxying Sarvam AI.
 *
 * These exist so SARVAM_API_KEY stays on the server. They are all
 * authenticated and rate-limited under the AI bucket, since each call costs
 * money upstream.
 */

import { Router } from "express"
import multer from "multer"
import { requireAuth } from "../middleware/auth.js"
import { aiLimiter } from "../middleware/rateLimit.js"
import { validate, z } from "../middleware/validate.js"
import { asyncHandler, badRequest } from "../utils/errors.js"
import { ok } from "../utils/respond.js"
import {
  isSarvamConfigured,
  speechToText,
  textToSpeech,
  translateText,
} from "../services/sarvamService.js"

const router = Router()

// Audio is held in memory and forwarded straight to Sarvam; it is never written
// to disk. 10 MB comfortably covers a few minutes of webm/opus while bounding
// per-request memory.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("audio/")) {
      return cb(badRequest("Upload must be an audio file"))
    }
    cb(null, true)
  },
})

const languageCode = z.enum([
  "en", "hi", "bn", "gu", "kn", "ml", "mr", "or", "od", "pa", "ta", "te", "as",
])

/** Advertises whether voice features are usable, so the UI can hide controls. */
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    ok(res, { configured: isSarvamConfigured() })
  }),
)

router.post(
  "/transcribe",
  requireAuth,
  aiLimiter,
  upload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No audio file was uploaded (field name: 'audio')")

    // Default to auto-detect so code-mixed speech still transcribes well.
    const langCode = req.body?.language || "auto"

    const result = await speechToText(req.file.buffer, {
      filename: req.file.originalname || "audio.webm",
      mimeType: req.file.mimetype,
      langCode,
    })

    ok(res, result)
  }),
)

router.post(
  "/speak",
  requireAuth,
  aiLimiter,
  validate({
    body: z
      .object({
        text: z.string().min(1).max(5000),
        language: languageCode.default("en"),
        speaker: z.string().max(50).optional(),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const { text, language, speaker } = req.valid.body
    const result = await textToSpeech(text, { langCode: language, speaker })
    ok(res, result)
  }),
)

router.post(
  "/translate",
  requireAuth,
  aiLimiter,
  validate({
    body: z
      .object({
        text: z.string().min(1).max(10000),
        targetLanguage: languageCode.default("en"),
        sourceLanguage: z.union([languageCode, z.literal("auto")]).default("auto"),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const { text, targetLanguage, sourceLanguage } = req.valid.body
    const result = await translateText(text, {
      targetLangCode: targetLanguage,
      sourceLangCode: sourceLanguage,
    })
    ok(res, result)
  }),
)

export default router
