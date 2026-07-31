/**
 * Health and capability reporting.
 *
 * `/api/health` is a liveness probe. `/api/health/ready` additionally pings
 * Supabase and reports which optional integrations are configured, which makes
 * it the fastest way to diagnose "the AI features aren't working" in a
 * deployment.
 */

import { Router } from "express"
import { supabase } from "../config/supabase.js"
import {
  env,
  isGroqConfigured,
  isGeminiConfigured,
  isSarvamConfigured,
  isFirebaseConfigured,
  isYoutubeConfigured,
} from "../config/env.js"
import { ok } from "../utils/respond.js"
import { asyncHandler } from "../utils/errors.js"

const router = Router()

router.get("/", (_req, res) =>
  ok(res, {
    status: "ok",
    service: "kyren-api",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  }),
)

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    let database = "ok"
    let databaseError

    try {
      const { error } = await supabase
        .from("skills")
        .select("id", { count: "exact", head: true })
      if (error) {
        database = "error"
        databaseError = error.message
      }
    } catch (err) {
      database = "error"
      databaseError = err.message
    }

    return ok(res, {
      status: database === "ok" ? "ready" : "degraded",
      database,
      databaseError,
      integrations: {
        groq: isGroqConfigured(),
        gemini: isGeminiConfigured(),
        sarvam: isSarvamConfigured(),
        firebaseGoogleAuth: isFirebaseConfigured(),
        youtube: isYoutubeConfigured(),
      },
      timestamp: new Date().toISOString(),
    })
  }),
)

export default router
