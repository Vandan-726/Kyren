import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"
import { enqueueJob } from "../../services/jobQueue.js"

/**
 * Generates a personalized learning roadmap (sequence of tasks) for a user.
 *
 * TODO: When XAI_API_KEY is available, call the createLearningPath agent.
 * For now, creates a simple placeholder roadmap with 2-3 tasks.
 *
 * Input:
 * - userId: UUID of the learner
 * - gapId: (optional) UUID of a specific learning gap to plan around
 * - targetSkillCode: skill to end at (e.g., "dsa")
 * - autoCourses: boolean, whether to enqueue course generation for each task
 *
 * Output:
 * - taskIds: array of created task UUIDs
 * - firstCourseJobId: job ID if autoCourses is enabled
 */
export async function handleRoadmapGeneration(job) {
  const { payload, user_id: userId } = job
  const { gapId, targetSkillCode, autoCourses = false } = payload

  if (!userId || !targetSkillCode) {
    throw new Error("roadmapGeneration requires userId and targetSkillCode in payload")
  }

  // 1. Load the target skill.
  const targetSkill = unwrap(
    await supabase
      .from("skills")
      .select("id, skill_code, skill_name, prerequisite_skill_codes")
      .eq("skill_code", targetSkillCode)
      .single(),
    "Loading target skill",
  )

  // 2. Placeholder: create a simple 2-task roadmap. Real agent planning happens when key is available.
  const plan = {
    tasks: [
      {
        skillCode: "functions",
        title: "Master Functions",
        description: "Learn how to write and use functions effectively",
        difficulty: "intermediate",
        estimatedHours: 12,
      },
      {
        skillCode: targetSkillCode,
        title: `Master ${targetSkill.skill_name}`,
        description: `Complete learning path for ${targetSkill.skill_name}`,
        difficulty: "advanced",
        estimatedHours: 24,
      },
    ],
  }

  // 3. Create learning tasks and dependencies.
  const taskIds = []
  const dependencies = []

  for (let i = 0; i < plan.tasks.length; i++) {
    const taskData = plan.tasks[i]
    const skillRow = (
      await supabase
        .from("skills")
        .select("id")
        .eq("skill_code", taskData.skillCode)
        .single()
    ).data

    const task = unwrap(
      await supabase
        .from("learning_tasks")
        .insert({
          user_id: userId,
          task_title: taskData.title,
          task_description: taskData.description,
          skill_id: skillRow?.id,
          gap_id: gapId ?? null,
          priority_level: 1 + i,
          difficulty: taskData.difficulty,
          estimated_duration_hours: taskData.estimatedHours,
          sequence_order: i,
          status: "suggested",
          prerequisite_task_ids: i > 0 ? [taskIds[i - 1]] : [],
        })
        .select("id")
        .single(),
      "Creating task",
    )
    taskIds.push(task.id)

    // Record dependency on the previous task in the plan.
    if (i > 0) {
      dependencies.push({
        user_id: userId,
        source_task_id: taskIds[i - 1],
        target_task_id: task.id,
        dependency_type: "prerequisite",
      })
    }
  }

  if (dependencies.length > 0) {
    await supabase.from("task_dependency_graph").insert(dependencies)
  }

  // 4. Optionally enqueue course generation for each task.
  let firstCourseJobId = null
  if (autoCourses && taskIds.length > 0) {
    const firstSkill = (
      await supabase
        .from("skills")
        .select("id")
        .eq("skill_code", plan.tasks[0].skillCode)
        .single()
    ).data

    if (firstSkill) {
      const courseJob = await enqueueJob({
        type: "course.generate",
        userId,
        payload: { skillId: firstSkill.id, taskId: taskIds[0] },
      })
      firstCourseJobId = courseJob.id
    }
  }

  return {
    taskIds,
    taskCount: taskIds.length,
    firstCourseJobId,
  }
}

registerHandler("roadmap.generate", handleRoadmapGeneration)
