/**
 * Recovery Agent - Learning Recovery Mode Service
 * 
 * Detects learning failure patterns and generates targeted 5-minute remedial micro-modules
 * across 4 recovery strategies (Prerequisite Review, Misconception Correction, Slower Pace, Alternative Medium).
 */

import { chat } from "../../../config/ai.js"
import { getLanguageName } from "./content.agent.js"

/**
 * Checks whether Learning Recovery Mode should be triggered for a student.
 * 
 * @param {string} userId
 * @param {string} skillId
 * @param {Array<number>} recentScores - Array of recent quiz scores (%)
 * @param {number} attemptCount - Number of quiz attempts
 * @param {number} timeSpentSeconds
 * @param {number} expectedTimeSeconds
 * @returns {object} { shouldTrigger: boolean, strategy: string, reason: string }
 */
export function checkAndTriggerRecoveryMode(userId, skillId, recentScores = [], attemptCount = 1, timeSpentSeconds = 180, expectedTimeSeconds = 180) {
  const avgScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
    : 100

  const consecutiveFailures = [...recentScores].reverse().findIndex((s) => s >= 60)
  const failCount = consecutiveFailures === -1 ? recentScores.length : consecutiveFailures

  if (attemptCount >= 2 && avgScore < 50) {
    return {
      shouldTrigger: true,
      strategy: "prerequisite_review",
      reason: `Repeated low scores (average ${avgScore}% across ${attemptCount} attempts).`,
    }
  }

  if (failCount >= 2) {
    return {
      shouldTrigger: true,
      strategy: "misconception_correction",
      reason: `Consecutive failures (${failCount} failed quizzes).`,
    }
  }

  if (timeSpentSeconds > expectedTimeSeconds * 3 && (recentScores[recentScores.length - 1] || 0) < 60) {
    return {
      shouldTrigger: true,
      strategy: "slower_pace",
      reason: "High time spent with low comprehension.",
    }
  }

  return {
    shouldTrigger: false,
    strategy: "none",
    reason: "Student is making steady progress.",
  }
}

/**
 * Generate a 5-minute remedial micro-module for quick recovery.
 * 
 * @param {string} concept
 * @param {string} misconception
 * @param {object} studentContext
 * @param {string} [strategy="misconception_correction"]
 * @param {string} [language="en"]
 * @returns {Promise<object>}
 */
export async function generateRecoveryModule(concept, misconception = "", studentContext = {}, strategy = "misconception_correction", language = "en") {
  const languageName = getLanguageName(language)
  const eduLevel = studentContext.education_level || "undergraduate"

  const prompt = `Generate a 5-minute remedial micro-module for quick recovery:

CONCEPT: ${concept}
MISCONCEPTION: ${misconception || "Struggling with fundamental principles"}
STUDENT_LEVEL: ${eduLevel}
STRATEGY: ${strategy}
LANGUAGE: ${languageName}

STRUCTURE REQUIRED:
1. Quick explanation (100 words max) in ${languageName}
2. Visual example or analogy in ${languageName}
3. Common mistake to avoid in ${languageName}
4. 1 practice question with 3 options
5. Mini quiz (2 questions) with correct answers and explanations

GOAL: Clarify concept quickly and build confidence.

RESPONSE SCHEMA:
{
  "title": "Micro-Module: Title in ${languageName}",
  "explanation": "Quick explanation in 100 words max",
  "analogy": "Visual example or analogy",
  "mistakeToAvoid": "Common mistake to avoid",
  "practiceQuestion": {
    "question": "Practice question text",
    "options": ["Option A", "Option B", "Option C"],
    "correctAnswer": "Option A",
    "explanation": "Why correct"
  },
  "miniQuiz": [
    {
      "question": "Mini quiz question 1",
      "options": ["Option A", "Option B"],
      "correctAnswer": "Option A",
      "explanation": "Explanation text"
    }
  ]
}`

  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      explanation: { type: "string" },
      analogy: { type: "string" },
      mistakeToAvoid: { type: "string" },
      practiceQuestion: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctAnswer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correctAnswer"],
      },
      miniQuiz: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["question", "options", "correctAnswer"],
        },
      },
    },
    required: ["title", "explanation", "analogy", "mistakeToAvoid", "practiceQuestion", "miniQuiz"],
  }

  try {
    const res = await chat({
      prompt,
      schema,
      schemaName: "recovery_module",
      requestType: "recovery_module",
      temperature: 0.5,
      maxTokens: 1200,
    })

    if (res && res.title) {
      return res
    }
  } catch (error) {
    console.error("[RecoveryAgent] Recovery module generation failed:", error.message)
  }

  // Fallback Micro-Module
  return {
    title: `Quick Recovery: ${concept}`,
    explanation: `Let's break down ${concept} step-by-step. Remember that foundational rules guide every solution. Focus on the core objective first.`,
    analogy: `Think of ${concept} like building blocks: each step rests firmly on the previous foundation.`,
    mistakeToAvoid: `Don't rush to complex steps before mastering the basic rule.`,
    practiceQuestion: {
      question: `What is the first step when solving ${concept}?`,
      options: ["Identify the core rule", "Skip to final answer", "Guess randomly"],
      correctAnswer: "Identify the core rule",
      explanation: "Identifying the core rule sets up the correct workflow."
    },
    miniQuiz: [
      {
        question: `True or False: Practicing basic steps improves problem solving speed.`,
        options: ["True", "False"],
        correctAnswer: "True",
        explanation: "Consistent practice builds muscle memory and speed."
      }
    ]
  }
}
