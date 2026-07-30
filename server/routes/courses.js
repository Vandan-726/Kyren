import { Router } from "express"
import { z } from "zod"
import { validate } from "../middleware/validate.js"
import { requireAuth, optionalAuth } from "../middleware/auth.js"
import { ok } from "../utils/respond.js"
import { supabase, unwrap } from "../config/supabase.js"
import { notFound } from "../utils/errors.js"

const router = Router()

/**
 * GET /api/courses
 *
 * List courses, optionally filtered by skill or user. Returns paginated results.
 */
router.get(
  "/",
  optionalAuth,
  validate({
    query: z.object({
      skillCode: z.string().optional(),
      userId: z.string().uuid().optional(),
      limit: z
        .string()
        .optional()
        .transform((v) => Math.min(parseInt(v, 10) || 20, 100)),
      offset: z
        .string()
        .optional()
        .transform((v) => parseInt(v, 10) || 0),
    }),
  }),
  async (req, res, next) => {
    try {
      const { skillCode, userId, limit, offset } = req.valid.query

      let query = supabase
        .from("courses")
        .select("id, title, description, skill_id, user_id, difficulty_level, estimated_duration_hours, generated_by_ai, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1)

      if (skillCode) {
        const skill = await supabase.from("skills").select("id").eq("skill_code", skillCode).single()
        if (skill.data) query = query.eq("skill_id", skill.data.id)
      }
      if (userId) query = query.eq("user_id", userId)

      const courses = unwrap(await query, "Loading courses")

      ok(res, { courses, offset, limit })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/courses/:courseId
 *
 * Get a single course with its modules and lessons.
 */
router.get(
  "/:courseId",
  optionalAuth,
  validate({ params: z.object({ courseId: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const courseId = req.valid.params.courseId

      const course = unwrap(
        await supabase
          .from("courses")
          .select(
            `
        id, title, description, skill_id, user_id, difficulty_level,
        estimated_duration_hours, generated_by_ai, created_at,
        skills(skill_code, skill_name, skill_category),
        course_modules(
          id, module_number, title, objective, estimated_duration_hours,
          lessons(
            id, lesson_number, title, description, estimated_duration_minutes
          )
        )
      `,
          )
          .eq("id", courseId)
          .single(),
        "Loading course",
      )

      if (!course) throw notFound("Course not found")

      ok(res, course)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/courses/:courseId/enroll
 *
 * Enroll the authenticated user in a course.
 */
router.post(
  "/:courseId/enroll",
  requireAuth,
  validate({ params: z.object({ courseId: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const courseId = req.valid.params.courseId
      const userId = req.user.id

      // Create student_progress record
      await supabase.from("student_progress").insert({
        user_id: userId,
        course_id: courseId,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })

      ok(res, { enrolled: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router
