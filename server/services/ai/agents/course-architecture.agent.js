/**
 * Course Architecture Agent.
 *
 * Uses Gemini to generate a structured course outline consisting of modules,
 * lessons, objectives, and estimates based on a specific task and the learner's
 * background context.
 */

import { chat } from "../../../config/ai.js"
import { getTemplateCourseStructure } from "../fallback-templates.js"

/**
 * Validates that the generated course structure is valid and matches our rules:
 *   - 3-5 modules
 *   - 2-3 lessons per module minimum
 *   - Clear title and descriptions
 *
 * @param {object} structure
 * @returns {boolean}
 */
function validateStructure(structure) {
  if (!structure || typeof structure !== "object") return false
  if (!structure.title || !structure.description) return false

  const modules = structure.modules
  if (!Array.isArray(modules) || modules.length < 3 || modules.length > 5) {
    return false
  }

  for (const mod of modules) {
    if (!mod.title || !mod.objective) return false
    if (!Array.isArray(mod.lessons) || mod.lessons.length < 2) {
      return false
    }
    for (const les of mod.lessons) {
      if (!les.title || !les.description) return false
    }
  }

  return true
}

/**
 * Generates a structured course skeleton for a given learning task.
 *
 * @param {object} task
 * @param {string} task.title
 * @param {string} task.description
 * @param {string} [task.difficulty="intermediate"]
 * @param {object} [studentContext]
 * @returns {Promise<object>} Course structure (modules and lessons)
 */
export async function generateCourseStructure(task, studentContext = {}) {
  const profile = studentContext.profile || {}
  const lang = profile.preferred_language || "en"
  const eduLevel = profile.education_level || "undergraduate"
  const learningPace = profile.learning_pace || "medium"
  const learningGoal = profile.learning_goal || ""

  const prompt = `You are KYREN's Course Architecture Agent. Your job is to design a highly personalized course structure based on a learning task and the student's context.

Task Details:
- Title: ${task.title}
- Description: ${task.description || ""}
- Difficulty Level: ${task.difficulty || "intermediate"}

Student Context:
- Preferred Language: ${lang}
- Education Level: ${eduLevel}
- Learning Pace: ${learningPace}
- Long-term Learning Goal: ${learningGoal}

Create a structured course. The course must satisfy the following constraints:
1. It must contain between 3 and 5 modules.
2. Each module must contain between 2 and 4 lessons (minimum 2 lessons).
3. The content must be tailored to the student's education level and preferred language.
4. Provide realistic duration estimates (estimatedHours for modules, estimatedMinutes for lessons).

Return a JSON object matching this schema exactly:
{
  "title": "Course Title (tailored to task)",
  "description": "Comprehensive course description.",
  "difficulty": "beginner | intermediate | advanced",
  "estimatedHours": 10,
  "modules": [
    {
      "title": "Module Title",
      "objective": "Learning objective for this module.",
      "estimatedHours": 3,
      "lessons": [
        {
          "title": "Lesson Title",
          "description": "Clear lesson description.",
          "objective": "What the student will learn in this lesson.",
          "keyConcepts": ["Concept 1", "Concept 2"],
          "estimatedMinutes": 45
        }
      ]
    }
  ]
}

Only return the raw JSON object. Do not wrap in markdown or include prose.`

  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
      estimatedHours: { type: "number" },
      modules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            objective: { type: "string" },
            estimatedHours: { type: "number" },
            lessons: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  objective: { type: "string" },
                  keyConcepts: { type: "array", items: { type: "string" } },
                  estimatedMinutes: { type: "number" },
                },
                required: ["title", "description", "objective", "keyConcepts", "estimatedMinutes"],
              },
            },
          },
          required: ["title", "objective", "estimatedHours", "lessons"],
        },
      },
    },
    required: ["title", "description", "difficulty", "estimatedHours", "modules"],
  }

  try {
    const response = await chat({
      prompt,
      schema,
      schemaName: "course_structure",
      requestType: "course_generation",
      temperature: 0.7,
      maxTokens: 2000,
    })

    if (validateStructure(response)) {
      return response
    }
    console.warn("[CourseArchitectureAgent] AI response failed structure validation, using template.")
  } catch (error) {
    console.error("[CourseArchitectureAgent] Failed to generate course structure:", error.message)
  }

  // Fallback to static template
  const fallback = getTemplateCourseStructure(task.title, task.difficulty)
  // Adapt structure to match the required schema exactly
  return {
    title: fallback.course.title,
    description: fallback.course.description,
    difficulty: fallback.course.difficulty,
    estimatedHours: 12,
    modules: fallback.modules.map((m, idx) => ({
      title: m.title,
      objective: m.objective,
      estimatedHours: 4,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        description: l.description,
        objective: l.description,
        keyConcepts: [l.title],
        estimatedMinutes: 45,
      })),
    })),
  }
}
