/**
 * Worker handler for course content population.
 * Registers the "course.populate_content" job.
 */

import { registerHandler } from "../registry.js"
import { processCourseContentJob } from "../../services/job-queue.service.js"

// Registers the processor function with the local worker queue
registerHandler("course.populate_content", processCourseContentJob)
export {}
