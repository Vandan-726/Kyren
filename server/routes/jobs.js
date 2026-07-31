import { Router } from "express"
import { requireCronSecret } from "../middleware/auth.js"
import { drainJobs } from "../worker/runner.js"
import { ok } from "../utils/respond.js"

const router = Router()

/**
 * POST /api/jobs/drain
 *
 * Triggered by Vercel Cron (or manually with cron secret) to drain
 * the job queue in production serverless environment.
 */
router.post("/drain", requireCronSecret, async (req, res, next) => {
  try {
    const max = req.query.max ? parseInt(req.query.max, 10) : undefined
    const result = await drainJobs({ max })
    ok(res, result)
  } catch (err) {
    next(err)
  }
})

export default router
