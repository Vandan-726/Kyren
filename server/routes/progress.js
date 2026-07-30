import { Router } from "express"
import { z } from "zod"
import { validate } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { ok } from "../utils/respond.js"
import { supabase, unwrap } from "../config/supabase.js"

const router = Router()

/**
 * GET /api/progress/courses
 *
 * Get the user's progress across all enrolled courses.
 */
router.get(
  "/courses",
  requireAuth,
  validate({
    query: z.object({
      limit: z
        .string()
        .optional()
        .transform((v) => Math.min(parseInt(v, 10) || 20, 100)),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const { limit } = req.valid.query

      const progress = unwrap(
        await supabase
          .from("student_progress")
          .select(
            `
        id, course_id, overall_completion_percentage, modules_completed,
        lessons_completed, average_quiz_score, total_time_spent_minutes,
        status, started_at, completed_at, last_accessed_at,
        courses(id, title, estimated_duration_hours, skill_id, skills(skill_name))
      `,
          )
          .eq("user_id", userId)
          .order("last_accessed_at", { ascending: false, nullsFirst: false })
          .limit(limit),
        "Loading progress",
      )

      ok(res, { progress })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/progress/courses/:courseId
 *
 * Get detailed progress for a specific course.
 */
router.get(
  "/courses/:courseId",
  requireAuth,
  validate({ params: z.object({ courseId: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const courseId = req.valid.params.courseId

      const progress = unwrap(
        await supabase
          .from("student_progress")
          .select("*")
          .eq("user_id", userId)
          .eq("course_id", courseId)
          .single(),
        "Loading course progress",
      )

      // Also load lesson completions
      const completions = unwrap(
        await supabase.from("lesson_completions").select("lesson_id, videos_watched, quiz_passed, completed_at").eq("user_id", userId),
        "Loading lesson completions",
      )

      ok(res, { ...progress, lessonCompletions: completions })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/progress/lessons/:lessonId/complete
 *
 * Mark a lesson as completed (videos watched, quiz passed).
 */
router.post(
  "/lessons/:lessonId/complete",
  requireAuth,
  validate({
    params: z.object({ lessonId: z.string().uuid() }),
    body: z.object({
      videosWatched: z.number().int().min(0).optional(),
      quizPassed: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const lessonId = req.valid.params.lessonId
      const { videosWatched = 0, quizPassed = false } = req.valid.body

      const completion = await supabase
        .from("lesson_completions")
        .upsert({
          user_id: userId,
          lesson_id: lessonId,
          videos_watched: videosWatched,
          quiz_passed: quizPassed,
          completed_at: new Date().toISOString(),
        })
        .select("*")
        .single()

      ok(res, completion.data)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/progress/mastery
 *
 * Update a user's mastery score for a skill.
 */
router.post(
  "/mastery",
  requireAuth,
  validate({
    body: z.object({
      skillId: z.string().uuid(),
      masteryPercentage: z.number().min(0).max(100),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.user.id
      const { skillId, masteryPercentage } = req.valid.body

      const mastery = await supabase
        .from("student_skill_mastery")
        .upsert({
          user_id: userId,
          skill_id: skillId,
          mastery_percentage: masteryPercentage,
          last_assessed_at: new Date().toISOString(),
        })
        .select("*")
        .single()

      ok(res, mastery.data)
    } catch (err) {
      next(err)
    }
  },
)

export default router
