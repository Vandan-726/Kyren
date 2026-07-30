import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"

/**
 * Generates a complete course with modules, lessons, videos, and quizzes.
 *
 * TODO: When XAI_API_KEY is available, call the generateCourse agent.
 * For now, just creates a placeholder course structure.
 *
 * Input:
 * - skillId: UUID of the skill being taught
 * - userId: UUID of the user requesting the course
 * - taskId: (optional) UUID of the parent task, if this came from a learning plan
 *
 * Output:
 * - courseId: UUID of the created course
 * - modulesCount: number of modules created
 * - lessonsCount: total lessons across all modules
 */
export async function handleCourseGeneration(job) {
  const { payload, user_id: userId } = job
  const { skillId, taskId } = payload

  if (!skillId || !userId) {
    throw new Error("courseGeneration requires skillId and userId in payload")
  }

  // 1. Look up the skill to get its name and context.
  const skill = unwrap(
    await supabase.from("skills").select("skill_code, skill_name, skill_category, description").eq("id", skillId).single(),
    "Loading skill for course generation",
  )

  // 2. Placeholder: stub course structure. Replace with agent call when key is available.
  const courseOutline = {
    title: `${skill.skill_name} Mastery Course`,
    description: `A comprehensive course on ${skill.skill_name}`,
    difficultyLevel: "intermediate",
    estimatedHours: 40,
    modules: [
      {
        number: 1,
        title: `Introduction to ${skill.skill_name}`,
        objective: `Understand the fundamentals of ${skill.skill_name}`,
        estimatedHours: 8,
        lessons: [
          {
            number: 1,
            title: "Getting Started",
            description: `First steps in learning ${skill.skill_name}`,
            objective: "Understand core concepts",
            estimatedMinutes: 60,
            concepts: ["fundamentals", "terminology"],
            content: "# Getting Started\n\nThis is a placeholder lesson. Real content comes from the xAI agent.",
          },
        ],
      },
    ],
  }

  // 3. Create the course record.
  const course = unwrap(
    await supabase
      .from("courses")
      .insert({
        title: courseOutline.title,
        description: courseOutline.description,
        skill_id: skillId,
        user_id: userId,
        task_id: taskId ?? null,
        difficulty_level: courseOutline.difficultyLevel,
        estimated_duration_hours: courseOutline.estimatedHours,
        generated_by_ai: true,
        ai_model_used: "grok",
        generation_prompt: `Generate a course for ${skill.skill_name}`,
        status: "generated",
      })
      .select("id")
      .single(),
    "Creating course",
  )

  // 4. Insert modules, lessons, videos, and quizzes.
  let totalLessons = 0
  let totalVideos = 0
  let totalQuestions = 0

  for (const moduleData of courseOutline.modules) {
    const module = unwrap(
      await supabase
        .from("course_modules")
        .insert({
          course_id: course.id,
          module_number: moduleData.number,
          title: moduleData.title,
          objective: moduleData.objective,
          estimated_duration_hours: moduleData.estimatedHours,
          mastery_threshold: 80,
        })
        .select("id")
        .single(),
      "Creating module",
    )

    for (const lessonData of moduleData.lessons) {
      const lesson = unwrap(
        await supabase
          .from("lessons")
          .insert({
            module_id: module.id,
            lesson_number: lessonData.number,
            title: lessonData.title,
            description: lessonData.description,
            learning_objective: lessonData.objective,
            key_concepts: lessonData.concepts || [],
            content_markdown: lessonData.content,
            estimated_duration_minutes: lessonData.estimatedMinutes,
          })
          .select("id")
          .single(),
        "Creating lesson",
      )
      totalLessons++

      // Insert lesson videos if provided.
      if (lessonData.videos && Array.isArray(lessonData.videos)) {
        await supabase.from("lesson_videos").insert(
          lessonData.videos.map((v, i) => ({
            lesson_id: lesson.id,
            video_number: i + 1,
            title: v.title,
            description: v.description,
            youtube_video_id: v.youtubeId,
            youtube_url: v.youtubeUrl,
            duration_seconds: v.duration,
            relevance_score: v.relevanceScore || 85,
            educational_quality_score: v.qualityScore || 80,
            channel_name: v.channelName,
            channel_trust_score: v.trustScore || 75,
            language: v.language || "en",
            ai_summary: v.summary,
            key_takeaways: v.takeaways || [],
          })),
        )
        totalVideos += lessonData.videos.length
      }

      // Insert lesson quiz if provided.
      if (lessonData.quiz) {
        const quiz = unwrap(
          await supabase
            .from("lesson_quizzes")
            .insert({
              lesson_id: lesson.id,
              quiz_type: "formative",
              title: lessonData.quiz.title,
              description: lessonData.quiz.description,
              passing_score: 70,
              generated_by_ai: true,
              ai_model_used: "grok",
            })
            .select("id")
            .single(),
          "Creating quiz",
        )

        // Insert quiz questions.
        if (lessonData.quiz.questions && Array.isArray(lessonData.quiz.questions)) {
          await supabase.from("quiz_questions").insert(
            lessonData.quiz.questions.map((q, i) => ({
              quiz_id: quiz.id,
              question_number: i + 1,
              question_text: q.text,
              question_type: q.type || "multiple_choice",
              difficulty_level: q.difficulty || "medium",
              bloom_level: q.bloomLevel,
              options: q.options,
              correct_answer: q.correctAnswer,
              explanation: q.explanation,
            })),
          )
          totalQuestions += lessonData.quiz.questions.length
        }
      }
    }
  }

  return {
    courseId: course.id,
    modulesCount: courseOutline.modules.length,
    lessonsCount: totalLessons,
    videosCount: totalVideos,
    questionsCount: totalQuestions,
  }
}

registerHandler("course.generate", handleCourseGeneration)
