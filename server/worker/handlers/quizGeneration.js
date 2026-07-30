import { supabase, unwrap } from "../../config/supabase.js"
import { registerHandler } from "../registry.js"

/**
 * Generates a summative quiz for a lesson based on its learning objectives
 * and key concepts.
 *
 * TODO: When XAI_API_KEY is available, call the generateQuiz agent.
 * For now, creates placeholder quiz questions.
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
  const { lessonId, questionCount = 3 } = payload

  if (!lessonId) {
    throw new Error("quizGeneration requires lessonId in payload")
  }

  // 1. Load the lesson.
  const lesson = unwrap(
    await supabase
      .from("lessons")
      .select("id, title, learning_objective, key_concepts, content_markdown, module_id")
      .eq("id", lessonId)
      .single(),
    "Loading lesson",
  )

  // 2. Placeholder: create stub quiz questions. Real generation happens when key is available.
  const quizContent = {
    title: `${lesson.title} Quiz`,
    description: `Test your knowledge of ${lesson.title}`,
    passingScore: 70,
    timeLimit: 15,
    questions: Array.from({ length: Math.min(questionCount, 5) }, (_, i) => ({
      text: `Question ${i + 1}: What is the definition of ${lesson.title}?`,
      type: "multiple_choice",
      difficulty: "medium",
      bloomLevel: "comprehension",
      options: [`Correct answer`, "Wrong option 1", "Wrong option 2", "Wrong option 3"],
      correctAnswer: 0,
      explanation: "This is the correct answer because...",
    })),
  }

  // 3. Create the quiz record.
  const quiz = unwrap(
    await supabase
      .from("lesson_quizzes")
      .insert({
        lesson_id: lessonId,
        quiz_type: "summative",
        title: quizContent.title,
        description: quizContent.description,
        passing_score: quizContent.passingScore || 70,
        time_limit_minutes: quizContent.timeLimit || 30,
        randomize_questions: true,
        generated_by_ai: true,
        ai_model_used: "grok",
      })
      .select("id")
      .single(),
    "Creating quiz",
  )

  // 4. Insert the questions.
  if (quizContent.questions && Array.isArray(quizContent.questions)) {
    await supabase.from("quiz_questions").insert(
      quizContent.questions.map((q, i) => ({
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
  }

  return {
    quizId: quiz.id,
    questionsCount: quizContent.questions?.length || 0,
  }
}

registerHandler("quiz.generate", handleQuizGeneration)
