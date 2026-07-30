import { Router } from "express"

import * as userService from "../services/userService.js"
import { requireAuth } from "../middleware/auth.js"
import { validate, z, languageEnum } from "../middleware/validate.js"
import { asyncHandler } from "../utils/errors.js"
import { ok } from "../utils/respond.js"
import { revokeAllSessions } from "../services/tokenService.js"

const router = Router()

// Everything here is personal data; there are no public user endpoints.
router.use(requireAuth)

/**
 * Identity fields a user may change about themselves.
 *
 * `.strict()` rejects unknown keys, and `role`, `is_active`, `is_verified`,
 * `email` and `password_hash` are deliberately absent — so no client can
 * promote itself to admin or verify its own email by padding the payload.
 */
const accountPatchSchema = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().max(100).nullable(),
    phone: z.string().trim().max(20).nullable(),
    avatar_url: z.string().url().max(500).nullable(),
  })
  .partial()
  .strict()

/** Learning preferences stored on `student_profiles`. */
const profilePatchSchema = z
  .object({
    preferred_language: languageEnum,
    communication_mode: z.enum(["text", "voice", "mixed"]),
    education_level: z.enum(["high_school", "undergraduate", "graduate", "professional", "other"]).nullable(),
    learning_goal: z.string().trim().max(500).nullable(),
    learning_pace: z.enum(["slow", "medium", "fast"]).nullable(),
    learning_style: z.enum(["visual", "auditory", "kinesthetic", "reading"]).nullable(),
    parent_email: z.string().trim().toLowerCase().email().max(255).nullable(),
    institution_code: z.string().trim().max(100).nullable(),
    country: z.string().trim().max(100).nullable(),
    timezone: z.string().trim().max(50),
  })
  .partial()
  .strict()

router.get(
  "/me",
  asyncHandler(async (req, res) => ok(res, await userService.getProfile(req.user.id))),
)

router.patch(
  "/me",
  validate({ body: accountPatchSchema }),
  asyncHandler(async (req, res) => ok(res, await userService.updateProfile(req.user.id, req.valid.body))),
)

router.get(
  "/me/profile",
  asyncHandler(async (req, res) => ok(res, await userService.getLearningProfile(req.user.id))),
)

router.patch(
  "/me/profile",
  validate({ body: profilePatchSchema }),
  asyncHandler(async (req, res) => ok(res, await userService.updateLearningProfile(req.user.id, req.valid.body))),
)

router.post(
  "/me/onboarding",
  validate({
    body: z.object({
      account: accountPatchSchema.default({}),
      profile: profilePatchSchema.default({}),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await userService.completeOnboarding(req.user.id, req.valid.body))),
)

router.get(
  "/me/stats",
  asyncHandler(async (req, res) => ok(res, await userService.getStats(req.user.id))),
)

router.get(
  "/me/sessions",
  asyncHandler(async (req, res) => ok(res, await userService.listSessions(req.user.id))),
)

router.delete(
  "/me/sessions",
  asyncHandler(async (req, res) => {
    await revokeAllSessions(req.user.id)
    return ok(res, { success: true, message: "Signed out of all devices." })
  }),
)

export default router
