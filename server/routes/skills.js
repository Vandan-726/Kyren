import { Router } from "express"
import { z } from "zod"
import { validate } from "../middleware/validate.js"
import { optionalAuth, requireAuth } from "../middleware/auth.js"
import { ok } from "../utils/respond.js"
import { supabase, unwrap } from "../config/supabase.js"
import { notFound } from "../utils/errors.js"

const router = Router()

/**
 * GET /api/skills
 *
 * List all canonical skills, optionally with user mastery levels.
 */
router.get(
  "/",
  optionalAuth,
  validate({
    query: z.object({
      category: z.string().optional(),
      difficulty: z.string().optional(),
      limit: z
        .string()
        .optional()
        .transform((v) => Math.min(parseInt(v, 10) || 50, 100)),
    }),
  }),
  async (req, res, next) => {
    try {
      const { category, difficulty, limit } = req.valid.query
      const userId = req.user?.id

      let query = supabase.from("skills").select("*").limit(limit)

      if (category) query = query.eq("skill_category", category)
      if (difficulty) query = query.eq("difficulty_level", difficulty)

      let skills = unwrap(await query.order("skill_name"), "Loading skills")

      // If authenticated, add user mastery data
      if (userId) {
        const masteryData = await supabase
          .from("student_skill_mastery")
          .select("skill_id, mastery_percentage")
          .eq("user_id", userId)

        const masteryMap = Object.fromEntries(
          (masteryData.data || []).map((m) => [m.skill_id, m.mastery_percentage]),
        )

        skills = skills.map((skill) => ({
          ...skill,
          userMastery: masteryMap[skill.id] ?? null,
        }))
      }

      ok(res, { skills })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/skills/:skillCode
 *
 * Get a single skill with its prerequisites and dependents.
 */
router.get(
  "/:skillCode",
  optionalAuth,
  validate({ params: z.object({ skillCode: z.string() }) }),
  async (req, res, next) => {
    try {
      const skillCode = req.valid.params.skillCode
      const userId = req.user?.id

      const skill = unwrap(
        await supabase
          .from("skills")
          .select("*")
          .eq("skill_code", skillCode)
          .single(),
        "Loading skill",
      )

      if (!skill) throw notFound("Skill not found")

      // Add user mastery if authenticated
      if (userId) {
        const mastery = await supabase
          .from("student_skill_mastery")
          .select("mastery_percentage")
          .eq("user_id", userId)
          .eq("skill_id", skill.id)
          .single()

        skill.userMastery = mastery.data?.mastery_percentage ?? null
      }

      ok(res, skill)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/skills/graph/prerequisites
 *
 * Get the skill dependency graph starting from a specific skill.
 */
router.get(
  "/graph/prerequisites",
  optionalAuth,
  validate({
    query: z.object({
      skillCode: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { skillCode } = req.valid.query

      const skill = unwrap(
        await supabase
          .from("skills")
          .select("id, skill_code, skill_name, prerequisite_skill_codes")
          .eq("skill_code", skillCode)
          .single(),
        "Loading skill",
      )

      if (!skill) throw notFound("Skill not found")

      // Load prerequisite skills
      const prerequisites = skill.prerequisite_skill_codes
        ? await supabase
            .from("skills")
            .select("id, skill_code, skill_name, difficulty_level")
            .in("skill_code", skill.prerequisite_skill_codes)
        : { data: [] }

      ok(res, {
        skill: { id: skill.id, code: skill.skill_code, name: skill.skill_name },
        prerequisites: prerequisites.data || [],
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
