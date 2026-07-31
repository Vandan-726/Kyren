/**
 * Job Queue Service.
 *
 * Implements a hybrid queue architecture (Bull/Redis with fallback to Postgres
 * generation_jobs).
 *
 * Handles the asynchronous job "populate_course_content" which:
 *   - Fetches YouTube videos for lessons with rate-limiting.
 *   - Generates lesson summaries with batching.
 *   - Generates lesson quizzes with fallbacks.
 *   - Reports progress at 0%, 20%, 50%, 80%, 100% via WebSockets & logs.
 */

import { supabase, unwrap } from "../config/supabase.js"
import { env } from "../config/env.js"
import { webSocketService } from "./websocket.service.js"
import {
  generateLessonContent,
  generateVideoSuggestions,
  generateQuiz,
} from "./agents.js"
import {
  getFallbackVideoLibrary,
  getTemplateLessonContent,
  getTemplateQuiz,
} from "./ai/fallback-templates.js"
import { chat } from "../config/ai.js"
import { curateVideosForLesson } from "./video/youtube.service.js"
import { getChannelTrustScore } from "./video/video-ranker.service.js"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Hybrid Queue Class
// ---------------------------------------------------------------------------
export class HybridQueue {
  constructor(name) {
    this.name = name
    this.redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST)
    this.bullQueue = null
    this.handlers = []

    if (this.redisConfigured) {
      // Dynamic import to avoid crashes if Bull is not installed.
      import("bull")
        .then(({ default: Bull }) => {
          this.bullQueue = new Bull(name, process.env.REDIS_URL)
          console.log(`[Queue:${name}] Connected to Redis.`)
          for (const handler of this.handlers) {
            this.bullQueue.process(3, handler)
          }
        })
        .catch((err) => {
          console.warn(`[Queue:${name}] Bull failed to load, falling back to DB:`, err.message)
          this.redisConfigured = false
        })
    }
  }

  /**
   * Adds a job to the queue.
   */
  async add(payload, options = {}) {
    if (this.redisConfigured && this.bullQueue) {
      return await this.bullQueue.add(payload, options)
    }

    // Fallback: Postgres queue
    const { enqueueJob } = await import("./jobQueue.js")
    return await enqueueJob({
      type: `course.${this.name}`,
      userId: payload.userId || null,
      payload,
      maxAttempts: options.attempts || 3,
    })
  }

  /**
   * Registers a processor handler.
   */
  process(concurrency, handler) {
    if (typeof concurrency === "function") {
      handler = concurrency
      concurrency = 1
    }
    this.handlers.push(handler)
    if (this.redisConfigured && this.bullQueue) {
      this.bullQueue.process(concurrency, handler)
    }
  }
}

// Instantiate the course content queue
export const courseContentQueue = new HybridQueue("populate_content")

// ---------------------------------------------------------------------------
// Course Content Population Logic (Processor)
// ---------------------------------------------------------------------------

/**
 * Main processor logic for course content population.
 *
 * @param {object} job
 * @param {object} job.payload
 * @param {string} job.payload.courseId
 * @param {string[]} job.payload.lessonIds
 * @param {string} [job.user_id]
 */
export async function processCourseContentJob(job) {
  const payload = job.payload || {}
  const courseId = payload.courseId
  const lessonIds = payload.lessonIds || []
  const userId = job.user_id || payload.userId

  if (!courseId || lessonIds.length === 0) {
    throw new Error("Invalid payload: courseId and lessonIds are required")
  }

  const broadcastProgress = (progress, currentStep, timeRemaining) => {
    console.log(`[JobProgress] Course ${courseId}: ${progress}% - ${currentStep}`)
    if (userId) {
      webSocketService.emitToUser(userId, "course_progress", {
        courseId,
        progress,
        currentStep,
        estimatedTimeRemaining: timeRemaining,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 0%: Starting
  // -------------------------------------------------------------------------
  broadcastProgress(0, "Initializing course content generation...", 300)

  // Load Course and Skill context
  const course = unwrap(
    await supabase.from("courses").select("id, title, skill_id, difficulty_level").eq("id", courseId).single(),
    "Loading course details",
  )

  const skill = unwrap(
    await supabase.from("skills").select("id, skill_name").eq("id", course.skill_id).single(),
    "Loading skill details",
  )

  // Load user language
  let userLanguage = "en"
  if (userId) {
    const profile = await supabase.from("student_profiles").select("preferred_language").eq("user_id", userId).maybeSingle()
    userLanguage = profile.data?.preferred_language || "en"
  }

  // Fetch all lessons from DB
  const lessons = unwrap(
    await supabase
      .from("lessons")
      .select("id, title, description, learning_objective, lesson_number, module_id")
      .in("id", lessonIds)
      .order("lesson_number", { ascending: true }),
    "Loading lessons list",
  )

  // -------------------------------------------------------------------------
  // 20%: Videos fetched via curation pipeline (ranked, diverse, cached)
  // -------------------------------------------------------------------------
  broadcastProgress(10, "Curating educational videos from YouTube...", 240)

  const videoInserts = []
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]

    // Rate limit between lessons to be gentle on the API
    if (i > 0) await sleep(2000)

    try {
      const { videos, usedFallback } = await curateVideosForLesson({
        topic: `${lesson.title} ${skill.skill_name}`,
        difficulty: course.difficulty_level || "intermediate",
        language: userLanguage,
        keyConcepts: lesson.key_concepts || [],
        count: 4,
      })

      if (usedFallback) {
        console.warn(`[Videos] Fallback used for lesson "${lesson.title}"`)
      }

      for (const vid of videos) {
        videoInserts.push({
          lesson_id: lesson.id,
          video_number: vid.videoNumber || 1,
          title: vid.title || `${lesson.title} Video`,
          description: vid.description || `Educational video for ${lesson.title}`,
          youtube_video_id: vid.youtubeId || vid.youtube_video_id || "",
          youtube_url: vid.youtubeId
            ? `https://www.youtube.com/watch?v=${vid.youtubeId}`
            : "",
          duration_seconds: vid.durationSeconds || 600,
          relevance_score: vid.compositeScore || 70,
          educational_quality_score: vid._scores?.quality || 70,
          channel_name: vid.channelName || "Unknown",
          channel_trust_score: getChannelTrustScore(vid.channelName),
          language: userLanguage,
          ai_summary: `Educational resource for ${lesson.title}`,
          key_takeaways: [lesson.title],
        })
      }
    } catch (err) {
      console.error(`[Videos] Curation failed for "${lesson.title}":`, err.message)
      // Insert a single fallback placeholder so the lesson is not video-less
      const fb = getFallbackVideoLibrary(lesson.title).videos[0] || {}
      videoInserts.push({
        lesson_id: lesson.id,
        video_number: 1,
        title: fb.title || `${lesson.title} Video Guide`,
        description: `Fallback video for ${lesson.title}`,
        youtube_video_id: fb.youtube_video_id || "",
        youtube_url: fb.youtube_video_id
          ? `https://www.youtube.com/watch?v=${fb.youtube_video_id}`
          : "",
        duration_seconds: 600,
        relevance_score: 50,
        educational_quality_score: 50,
        channel_name: "Educational Hub",
        channel_trust_score: 50,
        language: userLanguage,
        ai_summary: `Fallback video for ${lesson.title}`,
        key_takeaways: [lesson.title],
      })
    }
  }

  // Store video relationships
  if (videoInserts.length > 0) {
    unwrap(
      await supabase.from("lesson_videos").insert(videoInserts),
      "Inserting lesson videos",
    )
  }

  broadcastProgress(40, "Videos populated. Preparing summaries...", 180)

  // -------------------------------------------------------------------------
  // 50%: Summaries generated (Batch process 3-4 lessons per call)
  // -------------------------------------------------------------------------
  broadcastProgress(50, "Generating comprehensive lesson summaries...", 120)

  const BATCH_SIZE = 3
  for (let i = 0; i < lessons.length; i += BATCH_SIZE) {
    const batch = lessons.slice(i, i + BATCH_SIZE)

    // Load related video titles to inject into context
    const batchLessonIds = batch.map((l) => l.id)
    const videos = unwrap(
      await supabase.from("lesson_videos").select("lesson_id, title").in("lesson_id", batchLessonIds),
      "Loading video contexts for summary",
    )

    const videoTitleMap = {}
    for (const v of videos) {
      videoTitleMap[v.lesson_id] = v.title
    }

    const batchPrompt = batch
      .map((lesson) => {
        const videoTitle = videoTitleMap[lesson.id] || "No video title available"
        return `Lesson ID: ${lesson.id}
Title: ${lesson.title}
Objective: ${lesson.learning_objective}
Description: ${lesson.description}
Video context: "${videoTitle}"`
      })
      .join("\n\n")

    const systemPrompt = `You are a curriculum expert. Generate a comprehensive summary (content_markdown) and key concepts for each lesson listed below.
The summary should be 200-300 words, rich with explanations, and formatted in Markdown.
You MUST output a JSON object matching this schema:
{
  "summaries": [
    {
      "lessonId": "uuid-here",
      "content_markdown": "Rich content summary in markdown format...",
      "key_concepts": ["key concept 1", "key concept 2"]
    }
  ]
}`

    const schema = {
      type: "object",
      properties: {
        summaries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lessonId: { type: "string" },
              content_markdown: { type: "string" },
              key_concepts: { type: "array", items: { type: "string" } },
            },
            required: ["lessonId", "content_markdown", "key_concepts"],
          },
        },
      },
      required: ["summaries"],
    }

    let summaryRes = null
    try {
      summaryRes = await chat({
        prompt: `Batch details:\n${batchPrompt}`,
        system: systemPrompt,
        schema,
        schemaName: "lesson_summaries",
        requestType: "lesson_content",
        temperature: 0.7,
        maxTokens: 1500 * batch.length,
      })
    } catch (err) {
      console.error("[Summary Batch] Gemini failed, checking fallbacks:", err.message)
      // Try Grok if available as fallback (chat client handles routing if configured)
    }

    // Save summaries to DB
    for (const lesson of batch) {
      const item = summaryRes?.summaries?.find((s) => s.lessonId === lesson.id)

      if (item) {
        unwrap(
          await supabase
            .from("lessons")
            .update({
              content_markdown: item.content_markdown,
              key_concepts: item.key_concepts,
            })
            .eq("id", lesson.id),
          "Updating lesson summary",
        )
      } else {
        // Fallback: template
        const template = getTemplateLessonContent(lesson.title)
        unwrap(
          await supabase
            .from("lessons")
            .update({
              content_markdown: `<!-- NEEDS_REVIEW: Summary generation failed -->\n\n${template.ai_summary}`,
              key_concepts: template.key_concepts,
            })
            .eq("id", lesson.id),
          "Updating lesson summary with fallback",
        )

        // Log to activity logs for review
        if (userId) {
          await supabase.from("task_activity_logs").insert({
            user_id: userId,
            event_type: "generation_failure",
            message: `Lesson "${lesson.title}" summary generation failed. Content marked as needs review.`,
          })
        }
      }
    }
  }

  broadcastProgress(75, "Summaries updated. Constructing quizzes...", 60)

  // -------------------------------------------------------------------------
  // 80%: Quizzes generated (5 questions per lesson quiz)
  // -------------------------------------------------------------------------
  broadcastProgress(80, "Generating formative quizzes...", 45)

  for (const lesson of lessons) {
    let quizRes = null

    try {
      quizRes = await generateQuiz({
        lesson: {
          title: lesson.title,
          description: lesson.description || "",
          learning_objective: lesson.learning_objective || "",
        },
        courseTitle: course.title,
        moduleTitle: "Interactive Session",
        difficulty: course.difficulty_level || "intermediate",
        numQuestions: 5,
      })
    } catch (err) {
      console.error(`[Quiz Generation] Failed for lesson ${lesson.id}:`, err.message)
    }

    if (quizRes && quizRes.questions && quizRes.questions.length > 0) {
      const quiz = unwrap(
        await supabase
          .from("lesson_quizzes")
          .insert({
            lesson_id: lesson.id,
            quiz_type: "formative",
            title: `${lesson.title} Quiz`,
            description: `Quick self-assessment for ${lesson.title}`,
            passing_score: 70,
            generated_by_ai: true,
            ai_model_used: env.ai.provider,
          })
          .select("id")
          .single(),
        "Inserting lesson quiz",
      )

      const questions = quizRes.questions.map((q, idx) => ({
        quiz_id: quiz.id,
        question_number: idx + 1,
        question_text: q.question_text,
        question_type: "multiple_choice",
        difficulty_level: q.difficulty || course.difficulty_level || "intermediate",
        bloom_level: "comprehension",
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: q.explanation || "",
      }))

      unwrap(
        await supabase.from("quiz_questions").insert(questions),
        "Inserting quiz questions",
      )
    } else {
      // Fallback: template quiz
      const fallbackQuiz = getTemplateQuiz(lesson.title, course.difficulty_level)

      const quiz = unwrap(
        await supabase
          .from("lesson_quizzes")
          .insert({
            lesson_id: lesson.id,
            quiz_type: "formative",
            title: `${lesson.title} Quiz (Template)`,
            description: `Self-assessment for ${lesson.title}`,
            passing_score: 70,
            generated_by_ai: false,
            ai_model_used: "fallback",
          })
          .select("id")
          .single(),
        "Inserting fallback quiz",
      )

      const questions = fallbackQuiz.questions.map((q, idx) => ({
        quiz_id: quiz.id,
        question_number: idx + 1,
        question_text: q.question_text,
        question_type: "multiple_choice",
        difficulty_level: q.difficulty,
        bloom_level: "understand",
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: "Fallback template explanation.",
      }))

      unwrap(
        await supabase.from("quiz_questions").insert(questions),
        "Inserting fallback quiz questions",
      )
    }
  }

  // -------------------------------------------------------------------------
  // 100%: Complete
  // -------------------------------------------------------------------------
  // Publish course to finalize status
  unwrap(
    await supabase.from("courses").update({ status: "generated" }).eq("id", courseId),
    "Publishing course on completion",
  )

  broadcastProgress(100, "Course generated and populated successfully!", 0)

  return {
    courseId,
    lessonsCount: lessons.length,
    status: "succeeded",
  }
}
