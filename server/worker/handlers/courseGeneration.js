import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"
import { env } from "../../config/env.js"
import {
  architectCourse,
  generateLessonContent,
  generateVideoSuggestions,
  generateQuiz,
} from "../../services/agents.js"

/**
 * Searches YouTube for a matching video snippet using Google API v3.
 */
async function searchYoutubeVideo(query, apiKey) {
  if (!apiKey) return null
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const item = data.items?.[0]
    if (item) {
      return {
        youtubeId: item.id?.videoId,
        title: item.snippet?.title,
        description: item.snippet?.description,
        channelName: item.snippet?.channelTitle,
        youtubeUrl: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
        duration: 600, // mock default duration (10 mins)
      }
    }
  } catch (err) {
    console.error("YouTube Curation Search Error:", err)
  }
  return null
}

/**
 * Generates a complete course with modules, lessons, videos, and quizzes using AI agents.
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

  // 2. Load the user's profile context.
  const profileRow = unwrap(
    await supabase
      .from("student_profiles")
      .select("preferred_language, learning_goal")
      .eq("user_id", userId)
      .maybeSingle(),
    "Loading user profile for course generation"
  )
  const userLanguage = profileRow?.preferred_language || "en"
  const userGoal = profileRow?.learning_goal || ""

  // 3. Architect the course structure via the Agent.
  const coursePlan = await architectCourse({
    task: {
      skill_id: skillId,
      skill_name: skill.skill_name,
      title: `Master ${skill.skill_name}`,
      description: skill.description,
      difficulty: "intermediate",
    },
    userLanguage,
    userGoal,
  })

  const { course: courseDetails, modules = [] } = coursePlan

  // 4. Create the course record in the database.
  const course = unwrap(
    await supabase
      .from("courses")
      .insert({
        title: courseDetails?.title || `${skill.skill_name} Course`,
        description: courseDetails?.description || `A comprehensive course on ${skill.skill_name}`,
        skill_id: skillId,
        user_id: userId,
        task_id: taskId ?? null,
        difficulty_level: courseDetails?.difficulty || "intermediate",
        estimated_duration_hours: parseInt(courseDetails?.estimated_duration) || 12,
        generated_by_ai: true,
        ai_model_used: env.ai.provider,
        generation_prompt: `Generate a course for ${skill.skill_name}`,
        status: "generated",
      })
      .select("id")
      .single(),
    "Creating course",
  )

  let totalLessons = 0
  let totalVideos = 0
  let totalQuestions = 0

  // 5. Build and insert modules and lessons.
  for (let modIdx = 0; modIdx < modules.length; modIdx++) {
    const moduleData = modules[modIdx]
    const module = unwrap(
      await supabase
        .from("course_modules")
        .insert({
          course_id: course.id,
          module_number: modIdx + 1,
          title: moduleData.title || `Module ${modIdx + 1}`,
          objective: moduleData.objective || "",
          estimated_duration_hours: moduleData.estimated_duration || 4,
          mastery_threshold: moduleData.mastery_threshold || 80,
        })
        .select("id")
        .single(),
      "Creating module",
    )

    const lessonsList = moduleData.lessons || []
    for (let lesIdx = 0; lesIdx < lessonsList.length; lesIdx++) {
      const lessonData = lessonsList[lesIdx]

      // Call Content Agent to generate summaries and key concepts for this lesson
      const lessonContent = await generateLessonContent({
        lesson: {
          title: lessonData.title,
          description: lessonData.description || "",
        },
        courseTitle: courseDetails?.title || skill.skill_name,
        moduleTitle: moduleData.title,
        difficulty: courseDetails?.difficulty || "intermediate",
        language: userLanguage,
      })

      // Insert lesson
      const lesson = unwrap(
        await supabase
          .from("lessons")
          .insert({
            module_id: module.id,
            lesson_number: lesIdx + 1,
            title: lessonData.title,
            description: lessonData.description || "",
            learning_objective: lessonData.description || "",
            key_concepts: lessonContent.key_concepts || [],
            content_markdown: lessonContent.ai_summary || "",
            estimated_duration_minutes: 45,
          })
          .select("id")
          .single(),
        "Creating lesson",
      )
      totalLessons++

      // Call Video Suggestions Agent
      const videoSuggestions = await generateVideoSuggestions({
        lesson: {
          title: lessonData.title,
          description: lessonData.description || "",
        },
        searchQueries: lessonContent.youtube_search_queries || [],
        difficulty: courseDetails?.difficulty || "intermediate",
        language: userLanguage,
      })

      // Fetch real YouTube videos if Youtube API is available
      const finalVideos = []
      const suggestedVideos = videoSuggestions.videos || []
      for (const sugVideo of suggestedVideos) {
        let videoId = sugVideo.youtube_video_id
        let videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""
        let chName = ""
        
        if (env.youtube.apiKey) {
          const ytResult = await searchYoutubeVideo(
            sugVideo.title || `${lessonData.title} tutorial`,
            env.youtube.apiKey
          )
          if (ytResult) {
            videoId = ytResult.youtubeId
            videoUrl = ytResult.youtubeUrl
            chName = ytResult.channelName
          }
        }

        finalVideos.push({
          title: sugVideo.title || `${lessonData.title} Video Guide`,
          description: sugVideo.description || "",
          youtubeId: videoId || "dQw4w9WgXcQ", // Fallback to classic placeholder
          youtubeUrl: videoUrl || "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          duration: sugVideo.duration || "10 min",
          relevanceScore: sugVideo.relevance_score || 90,
          qualityScore: 85,
          channelName: chName || "Educational Hub",
          trustScore: 80,
          language: userLanguage,
          summary: `Suggested resource for ${lessonData.title}`,
          takeaways: [],
        })
      }

      // Insert lesson videos
      if (finalVideos.length > 0) {
        await supabase.from("lesson_videos").insert(
          finalVideos.map((v, i) => ({
            lesson_id: lesson.id,
            video_number: i + 1,
            title: v.title,
            description: v.description,
            youtube_video_id: v.youtubeId,
            youtube_url: v.youtubeUrl,
            duration_seconds: parseInt(v.duration) * 60 || 600,
            relevance_score: v.relevanceScore,
            educational_quality_score: v.qualityScore,
            channel_name: v.channelName,
            channel_trust_score: v.trustScore,
            language: v.language,
            ai_summary: v.summary,
            key_takeaways: v.takeaways,
          })),
        )
        totalVideos += finalVideos.length
      }

      // Call Quiz Agent to generate a formative quiz
      const quizRes = await generateQuiz({
        lesson: {
          title: lessonData.title,
          description: lessonData.description || "",
          ai_summary: lessonContent.ai_summary || "",
          key_concepts: lessonContent.key_concepts || [],
        },
        courseTitle: courseDetails?.title || skill.skill_name,
        moduleTitle: moduleData.title,
        difficulty: courseDetails?.difficulty || "intermediate",
        numQuestions: 3,
      })

      const quizData = quizRes
      if (quizData?.questions?.length) {
        const quiz = unwrap(
          await supabase
            .from("lesson_quizzes")
            .insert({
              lesson_id: lesson.id,
              quiz_type: "formative",
              title: quizData.title || `${lessonData.title} Quiz`,
              description: quizData.description || `Test your knowledge of ${lessonData.title}`,
              passing_score: 70,
              generated_by_ai: true,
              ai_model_used: env.ai.provider,
            })
            .select("id")
            .single(),
          "Creating quiz",
        )

        // Insert quiz questions
        const questionsList = quizData.questions || []
        if (questionsList.length > 0) {
          await supabase.from("quiz_questions").insert(
            questionsList.map((q, i) => ({
              quiz_id: quiz.id,
              question_number: i + 1,
              question_text: q.question_text,
              question_type: "multiple_choice",
              difficulty_level: q.difficulty || "medium",
              bloom_level: "comprehension",
              options: q.options || [],
              correct_answer: q.correct_answer,
              explanation: "",
            })),
          )
          totalQuestions += questionsList.length
        }
      }
    }
  }

  return {
    courseId: course.id,
    modulesCount: modules.length,
    lessonsCount: totalLessons,
    videosCount: totalVideos,
    questionsCount: totalQuestions,
  }
}

registerHandler("course.generate", handleCourseGeneration)
