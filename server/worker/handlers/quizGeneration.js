import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"
import { env } from "../../config/env.js"
import { generateQuiz } from "../../services/agents.js"

/**
 * Generates a summative quiz for a lesson based on its learning objectives
 * and key concepts.
 *
 * Input:
 * - lessonId: UUID of the lesson
 * - questionCount: number of questions to generate (5-20)
 *
 * Output:
 * - quizId: UUID of the created quiz
 * - questionsCount: number of questions created
 */
export async function handleQuizGeneration(job) {
  const { payload } = job
  const { lessonId, questionCount = 5 } = payload

  if (!lessonId) {
    throw new Error("quizGeneration requires lessonId in payload")
  }

  // 1. Load the lesson, module, and course details.
  const lessonDetail = unwrap(
    await supabase
      .from("lessons")
      .select(`
        id,
        title,
        learning_objective,
        key_concepts,
        content_markdown,
        module_id,
        course_modules (
          title,
          courses (
            title,
            difficulty_level
          )
        )
      `)
      .eq("id", lessonId)
      .single(),
    "Loading lesson details for quiz generation",
  )

  const courseTitle = lessonDetail.course_modules?.courses?.title || ""
  const moduleTitle = lessonDetail.course_modules?.title || ""
  const difficulty = lessonDetail.course_modules?.courses?.difficulty_level || "medium"

  // 2. Call the Quiz Agent to generate a summative quiz.
  const quizRes = await generateQuiz({
    lesson: {
      title: lessonDetail.title,
      description: lessonDetail.learning_objective || "",
      ai_summary: lessonDetail.content_markdown || "",
      key_concepts: lessonDetail.key_concepts || [],
    },
    courseTitle,
    moduleTitle,
    difficulty,
    numQuestions: questionCount,
  })

  const quizContent = quizRes
  if (!quizContent?.questions?.length) {
    throw new Error("Quiz agent returned an empty response.")
  }

  // 3. Create the quiz record.
  const quiz = unwrap(
    await supabase
      .from("lesson_quizzes")
      .insert({
        lesson_id: lessonId,
        quiz_type: "summative",
        title: quizContent.title || `${lessonDetail.title} Summative Quiz`,
        description: quizContent.description || `Test your knowledge of ${lessonDetail.title}`,
        passing_score: 70,
        time_limit_minutes: 30,
        randomize_questions: true,
        generated_by_ai: true,
        ai_model_used: env.ai.provider,
      })
      .select("id")
      .single(),
    "Creating quiz",
  )

  // 4. Insert the questions.
  const questionsList = quizContent.questions || []
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
  }

  return {
    quizId: quiz.id,
    questionsCount: questionsList.length,
  }
}

registerHandler("quiz.generate", handleQuizGeneration)
