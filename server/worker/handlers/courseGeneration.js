import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"
import { generateCourseStructure } from "../../services/ai/agents/course-architecture.agent.js"
import { courseService } from "../../services/course.service.js"

/**
 * Worker handler to generate a course structure and initiate content population.
 *
 * Runs as the handler for the "course.generate" job.
 */
export async function handleCourseGeneration(job) {
  const { payload, user_id: userId } = job
  const { skillId, taskId } = payload

  if (!skillId || !userId) {
    throw new Error("courseGeneration requires skillId and userId in payload")
  }

  console.log(`[Worker] Starting course generation. Skill: ${skillId}, Task: ${taskId || "None"}`)

  // 1. Look up the skill details.
  const skill = unwrap(
    await supabase
      .from("skills")
      .select("id, skill_code, skill_name, description")
      .eq("id", skillId)
      .single(),
    "Loading skill for course structure generation",
  )

  // 2. Load the student profile context.
  const profileRow = unwrap(
    await supabase
      .from("student_profiles")
      .select("preferred_language, education_level, learning_pace, learning_goal")
      .eq("user_id", userId)
      .maybeSingle(),
    "Loading user profile for course generation",
  )

  const studentContext = {
    profile: profileRow,
  }

  // 3. Generate course structure skeleton using AI.
  const structure = await generateCourseStructure(
    {
      title: `Master ${skill.skill_name}`,
      description: skill.description || `A comprehensive guide to ${skill.skill_name}`,
      difficulty: "intermediate",
    },
    studentContext,
  )

  // 4. Create the course, modules, and lessons inside DB.
  // This automatically enqueues the 'course.populate_content' job.
  const result = await courseService.createCourseFromStructure({
    structure,
    userId,
    skillId,
    taskId,
  })

  console.log(`[Worker] Course structure created: ${result.courseId}. Enqueued content population.`)

  return result
}

registerHandler("course.generate", handleCourseGeneration)
