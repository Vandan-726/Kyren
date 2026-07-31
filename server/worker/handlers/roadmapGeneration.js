import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"
import { enqueueJob } from "../../services/jobQueue.js"
import { planLearningTasks } from "../../services/agents.js"

/**
 * Generates a personalized learning roadmap (sequence of tasks) for a user.
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
      .select("id, skill_code, skill_name, description, prerequisite_skill_codes")
      .eq("skill_code", targetSkillCode)
      .single(),
    "Loading target skill",
  )

  // 2. Load the user's mastery scores
  const masteryScoresRows = unwrap(
    await supabase
      .from("student_skill_mastery")
      .select(`
        mastery_percentage,
        skills (
          id,
          skill_name
        )
      `)
      .eq("user_id", userId),
    "Loading user mastery scores"
  ) || []

  const masteryScores = masteryScoresRows.map(m => ({
    skill_id: m.skills?.id,
    skill_name: m.skills?.skill_name,
    percentage: m.mastery_percentage,
    status: m.mastery_percentage >= 80 ? "mastered" : "in_progress"
  }))

  // 3. Load user goal from profiles
  const profileRow = unwrap(
    await supabase
      .from("student_profiles")
      .select("learning_goal")
      .eq("user_id", userId)
      .maybeSingle(),
    "Loading user profile"
  )
  const userGoal = profileRow?.learning_goal || ""

  // 4. Resolve detected gaps
  let detectedGaps = []
  if (gapId) {
    const gapRow = unwrap(
      await supabase
        .from("learning_gaps")
        .select(`
          id,
          skill_id,
          severity,
          skills (
            id,
            skill_name
          )
        `)
        .eq("id", gapId)
        .single(),
      "Loading gap"
    )
    if (gapRow) {
      detectedGaps.push({
        skill_id: gapRow.skills?.id || gapRow.skill_id,
        skill_name: gapRow.skills?.skill_name,
        severity: gapRow.severity
      })
    }
  } else {
    detectedGaps.push({
      skill_id: targetSkill.id,
      skill_name: targetSkill.skill_name,
      severity: "critical"
    })
  }

  // 5. Invoke Task Planning Agent
  const plan = await planLearningTasks({
    detectedGaps,
    masteryScores,
    userGoal
  })

  // 6. Create learning tasks and dependencies.
  const taskIds = []
  const dependencies = []
  const plannedTasks = plan.tasks || []

  for (let i = 0; i < plannedTasks.length; i++) {
    const taskData = plannedTasks[i]
    let skillRow = null

    if (taskData.skill_id) {
      skillRow = (
        await supabase
          .from("skills")
          .select("id, skill_code")
          .or(`id.eq.${taskData.skill_id},skill_name.ilike.%${taskData.skill_name || ""}%`)
          .limit(1)
          .maybeSingle()
      ).data
    }

    // Default fallback to target skill if no matching skill is resolved
    const skillId = skillRow?.id || targetSkill.id

    const task = unwrap(
      await supabase
        .from("learning_tasks")
        .insert({
          user_id: userId,
          task_title: taskData.title,
          task_description: taskData.description,
          skill_id: skillId,
          gap_id: gapId ?? null,
          priority_level: taskData.priority || (1 + i),
          difficulty: taskData.difficulty || "intermediate",
          estimated_duration_hours: parseFloat(taskData.estimated_time) || 12,
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

  // 7. Optionally enqueue course generation for each task.
  let firstCourseJobId = null
  if (autoCourses && taskIds.length > 0 && plannedTasks.length > 0) {
    const firstTask = plannedTasks[0]
    const firstSkillRow = (
      await supabase
        .from("skills")
        .select("id")
        .or(`id.eq.${firstTask.skill_id},skill_name.ilike.%${firstTask.skill_name || ""}%`)
        .limit(1)
        .maybeSingle()
    ).data

    const firstSkillId = firstSkillRow?.id || targetSkill.id

    if (firstSkillId) {
      const courseJob = await enqueueJob({
        type: "course.generate",
        userId,
        payload: { skillId: firstSkillId, taskId: taskIds[0] },
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
