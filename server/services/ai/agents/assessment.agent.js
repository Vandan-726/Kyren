/**
 * Assessment Agent - Adaptive Quiz Engine with Behavior Analysis
 * 
 * Generates 5-question adaptive quizzes with Bloom's taxonomy & difficulty progression,
 * performs quiz behavior analysis, detects learning gaps, and calculates mastery scores.
 */

import { chat } from "../../../config/ai.js"
import { getLanguageName } from "./content.agent.js"

/**
 * Generate a 5-question adaptive quiz for a lesson.
 * 
 * @param {object} lesson
 * @param {object} [moduleObj]
 * @param {object} [courseObj]
 * @param {string} [language="en"]
 * @param {string} [studentEducationLevel="undergraduate"]
 * @returns {Promise<Array<object>>}
 */
export async function generateQuiz(lesson, moduleObj = {}, courseObj = {}, language = "en", studentEducationLevel = "undergraduate") {
  const languageName = getLanguageName(language)
  const keyConcepts = lesson.keyConcepts || [lesson.title]

  const prompt = `Generate a 5-question quiz for this lesson:

LESSON CONTEXT:
Course: ${courseObj.title || "General Course"}
Module: ${moduleObj.title || "Core Module"}
Lesson: ${lesson.title}
Objective: ${lesson.objective || lesson.description || lesson.title}
Key Concepts: ${keyConcepts.join(", ")}

STUDENT CONTEXT:
Education Level: ${studentEducationLevel}
Language: ${languageName}

REQUIREMENTS:
- 5 questions total
- Question types: Mix of multiple_choice, true_false, short_answer
- Difficulty progression: Easy -> Easy-Medium -> Medium -> Hard -> Hard
- Bloom's levels: Remember, Understand, Apply, Analyze, Evaluate (one per question)
- Each question tests ONE concept
- Include common misconceptions as wrong options
- Answers must be factually correct in ${languageName}

RESPONSE SCHEMA:
{
  "questions": [
    {
      "questionNumber": 1,
      "question": "Question text in ${languageName}",
      "type": "multiple_choice",
      "difficulty": "easy",
      "bloomLevel": "remember",
      "conceptTested": "${keyConcepts[0] || lesson.title}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Why Option A is correct in ${languageName}",
      "commonMisconception": "Why students pick wrong answer"
    }
  ]
}`

  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionNumber: { type: "number" },
            question: { type: "string" },
            type: { type: "string", enum: ["multiple_choice", "true_false", "short_answer"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            bloomLevel: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate"] },
            conceptTested: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
            commonMisconception: { type: "string" },
          },
          required: ["questionNumber", "question", "type", "difficulty", "bloomLevel", "conceptTested", "correctAnswer", "explanation"],
        },
      },
    },
    required: ["questions"],
  }

  try {
    const res = await chat({
      prompt,
      schema,
      schemaName: "quiz_generation",
      requestType: "quiz_generation",
      temperature: 0.6,
      maxTokens: 2000,
    })

    if (res && Array.isArray(res.questions) && res.questions.length >= 3) {
      return res.questions.slice(0, 5)
    }
  } catch (error) {
    console.error("[AssessmentAgent] Failed to generate quiz:", error.message)
  }

  // Fallback Quiz
  return [
    {
      questionNumber: 1,
      question: `What is the primary objective of ${lesson.title}?`,
      type: "multiple_choice",
      difficulty: "easy",
      bloomLevel: "remember",
      conceptTested: lesson.title,
      options: [
        `Understand core principles of ${lesson.title}`,
        `Ignore basic fundamentals`,
        `Skip practical implementation`,
        `None of the above`
      ],
      correctAnswer: `Understand core principles of ${lesson.title}`,
      explanation: `Building foundational knowledge is the primary objective of this lesson.`,
      commonMisconception: "Students often focus only on theory without practical application.",
    },
    {
      questionNumber: 2,
      question: `True or False: Key principles of ${lesson.title} apply to real-world problem solving.`,
      type: "true_false",
      difficulty: "medium",
      bloomLevel: "understand",
      conceptTested: lesson.title,
      options: ["True", "False"],
      correctAnswer: "True",
      explanation: "Concepts taught in this lesson directly map to practical applications.",
      commonMisconception: "Believing educational theory doesn't apply to practical scenarios.",
    },
    {
      questionNumber: 3,
      question: `Explain how ${lesson.title} helps in real-world scenarios.`,
      type: "short_answer",
      difficulty: "hard",
      bloomLevel: "apply",
      conceptTested: lesson.title,
      options: [],
      correctAnswer: `${lesson.title} provides structured frameworks to solve complex problems effectively.`,
      explanation: "Applies concepts to practical real-world workflows.",
      commonMisconception: "Confusing application with pure memorization.",
    }
  ]
}

/**
 * Perform behavior analysis on a completed quiz attempt to detect learning gaps.
 * 
 * @param {object} quizAttempt
 * @param {Array<object>} quizQuestions
 * @param {object} [studentContext={}]
 * @returns {Promise<{ gaps: Array<object>, overallAssessment: string }>}
 */
export async function analyzeQuizBehavior(quizAttempt, quizQuestions = [], studentContext = {}) {
  const wrongAnswers = (quizAttempt.responses || [])
    .filter((r) => !r.is_correct)
    .map((r) => {
      const q = quizQuestions.find((item) => item.id === r.question_id || item.questionNumber === r.question_number) || {}
      return {
        conceptTested: q.conceptTested || q.concept_name || "General Concept",
        questionType: q.bloomLevel || q.type || "apply",
        studentAnswer: r.user_answer,
        correctAnswer: q.correctAnswer || r.correct_answer,
        timeSpentSeconds: r.time_spent_seconds || 30,
        explanation: q.explanation || "",
      }
    })

  if (wrongAnswers.length === 0) {
    return {
      gaps: [],
      overallAssessment: "Excellent performance! No learning gaps detected.",
    }
  }

  const prompt = `Analyze this quiz performance and identify learning gaps:

QUIZ RESULTS:
- Score: ${quizAttempt.score}%
- Correct Answers: ${quizAttempt.correct_answers}/${quizAttempt.total_questions}
- Total Time Spent: ${quizAttempt.total_time_spent || 180} seconds

WRONG ANSWERS DETAIL:
${JSON.stringify(wrongAnswers, null, 2)}

STUDENT CONTEXT:
${JSON.stringify(studentContext, null, 2)}

TASK: Categorize each wrong answer into gap types:
1. knowledge_gap: Didn't know concept from start.
2. misconception: Has wrong mental model / systematic error.
3. careless: Knows concept but made minor error under time pressure.
4. weak_understanding: Remembers basic facts but struggles to apply.
5. prerequisite_missing: Lacks underlying prerequisite concept.

RESPONSE SCHEMA:
{
  "gaps": [
    {
      "conceptTested": "Concept Name",
      "gapType": "knowledge_gap | misconception | careless | weak_understanding | prerequisite_missing",
      "severity": "critical | high | medium | low",
      "confidence": 85,
      "reason": "Why this gap was detected",
      "affectedArea": "What this impacts",
      "recommendedAction": "Actionable advice",
      "suggestedMicromodule": "Topic title for remedial micro-module"
    }
  ],
  "overallAssessment": "Summary of student performance"
}`

  const schema = {
    type: "object",
    properties: {
      gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            conceptTested: { type: "string" },
            gapType: { type: "string", enum: ["knowledge_gap", "misconception", "careless", "weak_understanding", "prerequisite_missing"] },
            severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
            confidence: { type: "number" },
            reason: { type: "string" },
            affectedArea: { type: "string" },
            recommendedAction: { type: "string" },
            suggestedMicromodule: { type: "string" },
          },
          required: ["conceptTested", "gapType", "severity", "confidence", "reason", "recommendedAction"],
        },
      },
      overallAssessment: { type: "string" },
    },
    required: ["gaps", "overallAssessment"],
  }

  try {
    const analysis = await chat({
      prompt,
      schema,
      schemaName: "behavior_analysis",
      requestType: "behavior_analysis",
      temperature: 0.4,
      maxTokens: 1000,
    })

    if (analysis && Array.isArray(analysis.gaps)) {
      return analysis
    }
  } catch (error) {
    console.error("[AssessmentAgent] Behavior analysis failed:", error.message)
  }

  // Fallback Behavior Analysis
  return {
    gaps: wrongAnswers.map((w) => ({
      conceptTested: w.conceptTested,
      gapType: w.timeSpentSeconds > 45 ? "weak_understanding" : "careless",
      severity: "medium",
      confidence: 75,
      reason: `Incorrect response on ${w.conceptTested}`,
      affectedArea: w.conceptTested,
      recommendedAction: `Review ${w.conceptTested} with guided practice.`,
      suggestedMicromodule: `Mastering ${w.conceptTested}`,
    })),
    overallAssessment: "Review the recommended micro-modules to strengthen your understanding.",
  }
}

/**
 * Calculate adaptive mastery percentage based on quiz score, previous mastery, and detected gap types.
 * 
 * @param {number} quizScore - Percentage (0-100)
 * @param {number} previousMastery - Percentage (0-100)
 * @param {Array<object>} [gaps=[]]
 * @param {number} [timeSpentSeconds=180]
 * @param {number} [expectedTimeSeconds=180]
 * @returns {object} { newMastery, level }
 */
export function calculateMastery(quizScore, previousMastery = 50, gaps = [], timeSpentSeconds = 180, expectedTimeSeconds = 180) {
  // Base Formula: newMastery = (quizScore * 40%) + (previousMastery * 60%)
  let newMastery = (quizScore * 0.4) + (previousMastery * 0.6)

  // Adjustments based on gap types
  for (const gap of gaps) {
    if (gap.gapType === "knowledge_gap") newMastery *= 0.9
    if (gap.gapType === "misconception") newMastery *= 0.8
    if (gap.gapType === "careless") newMastery *= 1.05
  }

  // Time multiplier adjustment
  if (timeSpentSeconds > expectedTimeSeconds * 2 && quizScore < 70) {
    newMastery *= 0.95
  }

  newMastery = Math.min(100, Math.max(0, Math.round(newMastery)))

  // Mastery Level Mapping
  let level = "unlocked"
  if (newMastery >= 80) level = "mastered"
  else if (newMastery >= 50) level = "proficient"
  else if (newMastery >= 20) level = "learning"

  return { newMastery, level }
}
