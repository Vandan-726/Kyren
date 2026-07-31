import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import * as agents from "../services/agents.js"
import { ok } from "../utils/respond.js"
import { notFound } from "../utils/errors.js"

const router = Router()

/**
 * POST /api/agents/:agentName
 *
 * Dynamically invokes the specified AI agent in the backend.
 */
router.post(
  "/:agentName",
  requireAuth,
  async (req, res, next) => {
    try {
      const { agentName } = req.params
      const args = req.body || {}

      const agentFn = agents[agentName]
      if (!agentFn || typeof agentFn !== "function") {
        throw notFound(`Agent ${agentName} not found`)
      }

      // Automatically inject userId if not provided in args
      if (typeof args === "object" && args !== null) {
        if (!args.userId && req.user?.id) {
          args.userId = req.user.id
        }
      }

      const result = await agentFn(args)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  }
)

export default router
