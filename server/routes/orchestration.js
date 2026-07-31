/**
 * Orchestration API routes.
 *
 * POST /api/orchestrate       — Unified AI request endpoint
 * GET  /api/orchestrate/usage — Current user's AI usage summary
 * GET  /api/orchestrate/types — List all available request types
 */

import { Router } from "express"
import { z } from "zod"
import { validate } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { orchestrationEngine, AIOrchestrationEngine } from "../services/ai/orchestration-engine.js"
import { getUsageSummary, checkMonthlyBudget } from "../services/aiUsageService.js"
import { ok } from "../utils/respond.js"

const router = Router()

/**
 * POST /api/orchestrate
 *
 * Unified AI request endpoint. Accepts a request type and parameters,
 * routes to the correct agent, and returns a standardised response envelope.
 *
 * Body:
 *   - requestType: string (e.g. "gap_detection", "quiz_generation")
 *   - params: object (agent-specific parameters)
 */
router.post(
  "/",
  requireAuth,
  validate({
    body: z.object({
      requestType: z.string().min(1).max(50),
      params: z.record(z.unknown()).optional().default({}),
    }),
  }),
  async (req, res, next) => {
    try {
      const { requestType, params } = req.valid.body
      const userId = req.user?.id ?? null

      const result = await orchestrationEngine.orchestrateRequest({
        requestType,
        params,
        userId,
      })

      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/orchestrate/usage
 *
 * Returns the authenticated user's AI usage summary for the past N days.
 *
 * Query params:
 *   - days: number (default 7)
 */
router.get(
  "/usage",
  requireAuth,
  validate({
    query: z.object({
      days: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10) || 7, 90) : 7)),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const { days } = req.valid.query

      const [usageSummary, budgetStatus] = await Promise.all([
        getUsageSummary(userId, { days }),
        checkMonthlyBudget().catch(() => null),
      ])

      ok(res, {
        usage: usageSummary,
        budget: budgetStatus,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/orchestrate/types
 *
 * Lists all available request types the orchestration engine can handle.
 * Useful for frontend introspection and documentation.
 */
router.get("/types", requireAuth, (_req, res) => {
  ok(res, {
    requestTypes: AIOrchestrationEngine.listRequestTypes(),
  })
})

export default router
