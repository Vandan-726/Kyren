/**
 * Content Agent - AI Summary & Key Takeaway Generation Engine
 * 
 * Generates concise educational summaries (200-300 words) and 5-7 key takeaways
 * in the student's preferred language with token optimization & fallback support.
 */

import { chat } from "../../../config/ai.js"

export const LANG_NAME_MAP = {
  en: "English",
  hi: "Hindi (हिन्दी)",
  gu: "Gujarati (ગુજરાતી)",
  mr: "Marathi (मराठी)",
  bn: "Bengali (বাংলা)",
  ta: "Tamil (தமிழ்)",
  te: "Telugu (తెలుగు)",
  kn: "Kannada (કન્નડ)",
  ml: "Malayalam (മലയാളം)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
  or: "Odia (ଓଡ଼ିଆ)",
  od: "Odia (ଓଡ଼ିଆ)",
  as: "Assamese (অসমীয়া)",
}

export function getLanguageName(langCode = "en") {
  return LANG_NAME_MAP[langCode.toLowerCase()] || "English"
}

/**
 * Generate a concise educational summary for a lesson.
 * 
 * @param {object} lesson
 * @param {Array<string>} videoTitles
 * @param {string} language
 * @param {string} studentEducationLevel
 * @returns {Promise<string>}
 */
export async function generateLessonSummary(lesson, videoTitles = [], language = "en", studentEducationLevel = "undergraduate") {
  const languageName = getLanguageName(language)
  const keyConcepts = lesson.keyConcepts || [lesson.title]
  const videoList = videoTitles.length > 0 
    ? videoTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "1. Core Lesson Concepts Overview"

  const prompt = `Create a concise educational summary for this lesson:

LESSON DETAILS:
Topic: ${lesson.title}
Learning Objective: ${lesson.objective || lesson.description || lesson.title}
Key Concepts: ${keyConcepts.join(", ")}

VIDEOS COVERED:
${videoList}

REQUIREMENTS:
- Length: 200-300 words
- Language: ${languageName}
- Write in ${languageName} language ONLY
- Structure: Introduction -> Main concepts -> Real-world example -> Conclusion
- Vocabulary: Match education level ${studentEducationLevel}
- Tone: Professional but approachable
- Include a practical example or analogy
- End with: "Next, you'll learn about [next topic]"

RESPONSE FORMAT:
Write ONLY the summary text (no JSON, no markdown, no headers)`

  try {
    const summary = await chat({
      prompt,
      system: `You are an expert educator producing high-quality summary notes in ${languageName}. Always output clean text only in ${languageName}.`,
      temperature: 0.7,
      maxTokens: 1000,
    })

    if (typeof summary === "string" && summary.trim().length > 50) {
      return summary.trim()
    }
  } catch (error) {
    console.error("[ContentAgent] Summary generation failed:", error.message)
  }

  // Fallback Summary
  return `In this lesson on ${lesson.title}, we explore key concepts including ${keyConcepts.join(", ")}. Understanding these principles builds essential foundational skills in ${lesson.title}. A practical application can be observed in everyday problem solving. Next, you'll learn about the upcoming advanced modules.`
}

/**
 * Extract 5-7 key takeaways from a lesson summary.
 * 
 * @param {object} lesson
 * @param {string} summary
 * @param {string} language
 * @returns {Promise<Array<string>>}
 */
export async function extractKeyTakeaways(lesson, summary, language = "en") {
  const languageName = getLanguageName(language)
  const prompt = `From this lesson summary, extract 5-7 key takeaways:

LESSON: ${lesson.title}
OBJECTIVE: ${lesson.objective || lesson.title}

SUMMARY:
${summary}

REQUIREMENTS:
- Extract 5-7 bullet points
- Each point: 1-2 sentences (max 20 words)
- Language: ${languageName}
- Write ONLY in ${languageName}
- Points must be actionable/memorable
- Include at least 1 practical example point
- Include at least 1 "why this matters" point

RESPONSE FORMAT:
Return ONLY bullet points starting with "- " (one per line)`

  try {
    const response = await chat({
      prompt,
      system: `Extract key educational takeaways in ${languageName}. Output clean bullet points starting with "-" only.`,
      temperature: 0.5,
      maxTokens: 500,
    })

    if (typeof response === "string") {
      const points = response
        .split("\n")
        .map((line) => line.replace(/^[\s\-\*\•\d\.\)]+/, "").trim())
        .filter((line) => line.length > 0)
      if (points.length >= 3) {
        return points.slice(0, 7)
      }
    }
  } catch (error) {
    console.error("[ContentAgent] Key takeaways extraction failed:", error.message)
  }

  return [
    `Understand core concepts of ${lesson.title}.`,
    `Apply fundamental rules to solve real-world problems.`,
    `Recognize key patterns and structures.`,
    `Build confidence for advanced practical applications.`,
    `Identify essential tools and frameworks for future learning.`
  ]
}

/**
 * Combined token-optimized Summary and Key Takeaways generation.
 * Saves ~30% token overhead by running single LLM prompt.
 * 
 * @param {object} lesson
 * @param {Array<string>} videoTitles
 * @param {string} language
 * @param {string} studentEducationLevel
 * @returns {Promise<{ summary: string, takeaways: Array<string> }>}
 */
export async function generateCombinedSummaryAndTakeaways(lesson, videoTitles = [], language = "en", studentEducationLevel = "undergraduate") {
  const languageName = getLanguageName(language)
  const keyConcepts = lesson.keyConcepts || [lesson.title]
  const videoList = videoTitles.length > 0 
    ? videoTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "1. Core Lesson Concepts Overview"

  const prompt = `Create an educational summary (200-300 words) AND extract 5-7 key takeaways for this lesson:

LESSON: ${lesson.title}
OBJECTIVE: ${lesson.objective || lesson.title}
CONCEPTS: ${keyConcepts.join(", ")}
VIDEOS:
${videoList}

REQUIREMENTS:
- Language: ${languageName} ONLY
- Summary: 200-300 words structured clearly
- Takeaways: 5-7 actionable bullet points (max 20 words each)

RESPONSE FORMAT:
===SUMMARY===
[Summary text in ${languageName}]

===TAKEAWAYS===
- Takeaway 1
- Takeaway 2
- Takeaway 3
- Takeaway 4
- Takeaway 5`

  try {
    const raw = await chat({
      prompt,
      system: `Generate lesson summary and takeaways in ${languageName}. Always follow the exact section delimiters ===SUMMARY=== and ===TAKEAWAYS===.`,
      temperature: 0.6,
      maxTokens: 1200,
    })

    if (typeof raw === "string" && raw.includes("===SUMMARY===")) {
      const summaryPart = raw.split("===SUMMARY===")[1]?.split("===TAKEAWAYS===")[0]?.trim() || ""
      const takeawaysPart = raw.split("===TAKEAWAYS===")[1]?.trim() || ""

      const takeaways = takeawaysPart
        .split("\n")
        .map((line) => line.replace(/^[\s\-\*\•\d\.\)]+/, "").trim())
        .filter((line) => line.length > 0)

      if (summaryPart.length > 50 && takeaways.length >= 3) {
        return {
          summary: summaryPart,
          takeaways: takeaways.slice(0, 7),
        }
      }
    }
  } catch (error) {
    console.error("[ContentAgent] Combined generation failed:", error.message)
  }

  // Fallback
  const summary = await generateLessonSummary(lesson, videoTitles, language, studentEducationLevel)
  const takeaways = await extractKeyTakeaways(lesson, summary, language)
  return { summary, takeaways }
}
