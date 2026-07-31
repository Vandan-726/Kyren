import { Router } from "express"
import { z } from "zod"
import { validate } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { enqueueJob, getJobForUser, listJobsForUser } from "../services/jobQueue.js"
import { ok, created } from "../utils/respond.js"
import { notFound } from "../utils/errors.js"
import { supabase, unwrap } from "../config/supabase.js"
import { detectLearningGaps } from "../services/agents.js"

const router = Router()

/**
 * POST /api/learning/detect-gaps
 *
 * Analyzes the user's mastery scores and detects learning gaps where they
 * can improve. This runs the "detectLearningGaps" agent to produce a
 * personalized gap analysis.
 */
router.post(
  "/detect-gaps",
  requireAuth,
  validate({
    body: z.object({
      masteryScores: z.record(z.string(), z.number().min(0).max(100)).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { masteryScores = {} } = req.valid.body
      const userId = req.user.id

      // Retrieve existing gaps from database
      const existingGapsRows = unwrap(
        await supabase
          .from("learning_gaps")
          .select(`
            id,
            severity,
            skills (
              id,
              skill_name
            )
          `)
          .eq("user_id", userId),
        "Loading existing gaps",
      ) || []

      const existingGaps = existingGapsRows.map(g => ({
        skill_id: g.skills?.id,
        skill_name: g.skills?.skill_name,
        severity: g.severity
      }))

      // Convert masteryScores dict into list
      const skillCodes = Object.keys(masteryScores)
      let masteryList = []
      if (skillCodes.length > 0) {
        const skillsData = unwrap(
          await supabase
            .from("skills")
            .select("id, skill_code, skill_name")
            .in("skill_code", skillCodes),
          "Resolving skills for mastery check"
        ) || []

        masteryList = skillsData.map(s => ({
          skill_name: s.skill_name,
          percentage: masteryScores[s.skill_code] ?? 0,
          status: (masteryScores[s.skill_code] ?? 0) >= 80 ? "mastered" : "in_progress"
        }))
      }

      // Invoke the agent
      const gapResult = await detectLearningGaps({
        userMessage: "Analyze my progress and check for gaps.",
        context: "Progress dashboard review",
        masteryScores: masteryList,
        existingGaps
      })

      // Insert new gaps to the database
      const detectedGaps = gapResult.detected_gaps || []
      const createdGaps = []
      for (const gap of detectedGaps) {
        const { data: skill } = await supabase
          .from("skills")
          .select("id, skill_name, skill_category")
          .or(`id.eq.${gap.skill_id},skill_name.ilike.%${gap.skill_name || ""}%`)
          .limit(1)
          .maybeSingle()

        if (skill) {
          const alreadyExists = existingGapsRows.some(e => e.skills?.id === skill.id)
          if (!alreadyExists) {
            const gapRecord = unwrap(
              await supabase
                .from("learning_gaps")
                .insert({
                  user_id: userId,
                  gap_title: `Missing skill: ${skill.skill_name}`,
                  skill_area: skill.skill_category,
                  skill_id: skill.id,
                  severity: gap.severity || "medium",
                  detected_from: "assessment",
                  status: "detected",
                })
                .select("*")
                .single(),
              "Inserting detected gap"
            )
            createdGaps.push(gapRecord)
          }
        }
      }

      ok(res, {
        gaps: createdGaps.map(g => ({
          skillCode: g.skill_id,
          reason: gapResult.reasoning,
          priority: g.severity === "critical" ? 1 : 2
        })),
        rawResult: gapResult
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/learning/roadmap
 *
 * Generates a personalized learning roadmap (sequence of tasks) for a user,
 * optionally with auto-generated courses for each task.
 *
 * Body:
 * - targetSkillCode: e.g. "dsa"
 * - autoCourses: boolean, whether to auto-generate courses
 *
 * Returns:
 * - roadmapJobId: job ID to poll for completion
 */
router.post(
  "/roadmap",
  requireAuth,
  validate({
    body: z.object({
      targetSkillCode: z.string().min(1).max(50),
      autoCourses: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { targetSkillCode, autoCourses = true } = req.valid.body
      const userId = req.user.id

      const job = await enqueueJob({
        type: "roadmap.generate",
        userId,
        payload: { targetSkillCode, autoCourses },
      })

      created(res, {
        roadmapJobId: job.id,
        status: job.status,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/learning/jobs/:jobId
 *
 * Polls the status of a generation job (roadmap, course, quiz, etc.).
 */
router.get(
  "/jobs/:jobId",
  requireAuth,
  validate({ params: z.object({ jobId: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const jobId = req.valid.params.jobId
      const userId = req.user.id

      const job = await getJobForUser(jobId, userId)

      ok(res, {
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        createdAt: job.created_at,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/learning/jobs
 *
 * Lists the user's recent generation jobs.
 */
router.get(
  "/jobs",
  requireAuth,
  validate({
    query: z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10) || 20, 100) : 20)),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const { type, status, limit } = req.valid.query

      const jobs = await listJobsForUser(userId, { type, status, limit })

      ok(res, { jobs, count: jobs.length })
    } catch (err) {
      next(err)
    }
  },
)

export default router
