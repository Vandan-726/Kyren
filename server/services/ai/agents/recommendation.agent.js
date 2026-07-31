/**
 * Recommendation Agent - Adaptive Recommendations Engine
 * 
 * Analyzes student mastery profile, goals, and interests to generate
 * 3 personalized next course recommendations (Top Pick, Skill Building, Challenge).
 */

import { chat } from "../../../config/ai.js"
import { getLanguageName } from "./content.agent.js"

/**
 * Generate 3 personalized course recommendations based on student's learning journey.
 * 
 * @param {string} userId
 * @param {Array<object>} completedCourses
 * @param {Array<object>} masteryScores
 * @param {string} [goal="Master computer science concepts"]
 * @param {Array<string>} [interests=[]]
 * @param {string} [language="en"]
 * @returns {Promise<Array<object>>}
 */
export async function generateNextCourseRecommendations(userId, completedCourses = [], masteryScores = [], goal = "Master computer science concepts", interests = [], language = "en") {
  const languageName = getLanguageName(language)
  const completedTitles = completedCourses.map((c) => c.title || c.skill_name || "Completed Course")
  const masterySummary = masteryScores.map((m) => `${m.skill_name || "Skill"}: ${m.mastery_percentage || m.percentage || 50}%`).join(", ")

  const prompt = `Based on this student's learning journey, recommend the top 3 courses:

STUDENT PROFILE:
- Completed Courses: ${completedTitles.join(", ") || "None yet"}
- Mastery Scores: ${masterySummary || "Beginner stage"}
- Goal: ${goal}
- Interests: ${interests.join(", ") || "General learning"}
- Preferred Language: ${languageName}

RECOMMENDATION CRITERIA:
1. Recommendation 1 ("Top Pick"): Natural progression based on prerequisites.
2. Recommendation 2 ("Skill Building"): Addresses weak areas or reinforces proficient skills.
3. Recommendation 3 ("Challenge"): Advanced course to challenge without overwhelming.

RESPONSE SCHEMA:
{
  "recommendations": [
    {
      "badge": "Top Pick | Skill Building | Challenge",
      "title": "Course Title in ${languageName}",
      "reason": "Why this course was chosen",
      "whatItTeaches": "Core skills covered",
      "howItHelps": "How it connects to their goal",
      "estimatedWeeks": 4,
      "difficulty": "beginner | intermediate | advanced"
    }
  ]
}`

  const schema = {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            badge: { type: "string" },
            title: { type: "string" },
            reason: { type: "string" },
            whatItTeaches: { type: "string" },
            howItHelps: { type: "string" },
            estimatedWeeks: { type: "number" },
            difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          },
          required: ["badge", "title", "reason", "whatItTeaches", "howItHelps", "estimatedWeeks", "difficulty"],
        },
      },
    },
    required: ["recommendations"],
  }

  try {
    const res = await chat({
      prompt,
      schema,
      schemaName: "course_recommendations",
      requestType: "course_recommendations",
      temperature: 0.6,
      maxTokens: 1200,
    })

    if (res && Array.isArray(res.recommendations) && res.recommendations.length >= 3) {
      return res.recommendations.slice(0, 3)
    }
  } catch (error) {
    console.error("[RecommendationAgent] Recommendation generation failed:", error.message)
  }

  // Fallback Recommendations
  return [
    {
      badge: "Top Pick",
      title: "Data Structures & Algorithms Basics",
      reason: "Builds essential computational thinking skills based on your learning goal.",
      whatItTeaches: "Arrays, Linked Lists, Stacks, Queues, and Basic Sorting.",
      howItHelps: "Directly advances your goal of mastering technical problem solving.",
      estimatedWeeks: 4,
      difficulty: "intermediate",
    },
    {
      badge: "Skill Building",
      title: "Practical Problem Solving & Logic",
      reason: "Reinforces key concepts with interactive step-by-step exercises.",
      whatItTeaches: "Algorithmic thinking, debugging, and optimization techniques.",
      howItHelps: "Strengthens confidence and speed on foundational concepts.",
      estimatedWeeks: 2,
      difficulty: "beginner",
    },
    {
      badge: "Challenge",
      title: "Advanced System Design & Architecture",
      reason: "Pushes your skills further with real-world architectural design challenges.",
      whatItTeaches: "Scalability, microservices, databases, and API design.",
      howItHelps: "Prepares you for enterprise-level technical engineering tasks.",
      estimatedWeeks: 6,
      difficulty: "advanced",
    },
  ]
}
