/**
 * API route registry.
 *
 * Feature routers are mounted here and nowhere else, so this file is the map
 * of the entire public surface of the backend.
 */

import { Router } from "express"
import healthRouter from "./health.js"
import authRouter from "./auth.js"
import usersRouter from "./users.js"
import voiceRouter from "./voice.js"
import learningRouter from "./learning.js"
import coursesRouter from "./courses.js"
import progressRouter from "./progress.js"
import skillsRouter from "./skills.js"
import agentsRouter from "./agents.js"
import entitiesRouter from "./entities.js"
import orchestrationRouter from "./orchestration.js"
import jobsRouter from "./jobs.js"

const router = Router()

router.use("/health", healthRouter)
router.use("/auth", authRouter)
router.use("/users", usersRouter)
router.use("/voice", voiceRouter)
router.use("/learning", learningRouter)
router.use("/courses", coursesRouter)
router.use("/progress", progressRouter)
router.use("/skills", skillsRouter)
router.use("/agents", agentsRouter)
router.use("/orchestrate", orchestrationRouter)
router.use("/jobs", jobsRouter)
router.use("/", entitiesRouter)

export default router
