/**
 * Static fallback templates for when all AI providers are unavailable.
 *
 * These are intentionally simple, generic structures that give the student
 * *something* to work with rather than a blank error screen. They are never
 * as good as AI-generated content, but they unblock the learning flow.
 *
 * The orchestration engine invokes these only after the primary provider AND
 * the secondary provider have both failed or timed out.
 */

// ---------------------------------------------------------------------------
// Course structure fallback
// ---------------------------------------------------------------------------

/**
 * Returns a generic 3-module, 9-lesson course skeleton for any skill.
 *
 * @param {string} skillName  Human-readable skill name (e.g. "Variables in C")
 * @param {string} [difficulty="intermediate"]
 * @returns {{ course: object, modules: object[] }}
 */
export function getTemplateCourseStructure(skillName, difficulty = "intermediate") {
  return {
    course: {
      title: `${skillName} — Foundations`,
      description: `A structured introduction to ${skillName}, covering core concepts, practice, and application.`,
      difficulty,
      estimated_duration: "12 hours",
      learning_objectives: [
        `Understand the fundamental concepts of ${skillName}`,
        `Apply ${skillName} concepts through practical examples`,
        `Identify common patterns and pitfalls in ${skillName}`,
      ],
    },
    modules: [
      {
        title: `Introduction to ${skillName}`,
        objective: `Build foundational understanding of ${skillName}`,
        mastery_threshold: 70,
        lessons: [
          { title: `What is ${skillName}?`, description: `Overview and importance of ${skillName} in programming.`, order_index: 0 },
          { title: `Core Concepts`, description: `Key terminology and building blocks of ${skillName}.`, order_index: 1 },
          { title: `Your First Example`, description: `Hands-on walkthrough of a simple ${skillName} example.`, order_index: 2 },
        ],
      },
      {
        title: `${skillName} in Practice`,
        objective: `Apply ${skillName} to solve problems`,
        mastery_threshold: 75,
        lessons: [
          { title: `Common Patterns`, description: `Frequently used patterns and idioms in ${skillName}.`, order_index: 0 },
          { title: `Problem Solving`, description: `Step-by-step approach to solving problems with ${skillName}.`, order_index: 1 },
          { title: `Debugging & Mistakes`, description: `Common mistakes and how to identify and fix them.`, order_index: 2 },
        ],
      },
      {
        title: `Advanced ${skillName}`,
        objective: `Deepen mastery with challenging applications`,
        mastery_threshold: 80,
        lessons: [
          { title: `Advanced Techniques`, description: `More sophisticated uses of ${skillName}.`, order_index: 0 },
          { title: `Real-World Applications`, description: `How ${skillName} is used in real projects and systems.`, order_index: 1 },
          { title: `Review & Next Steps`, description: `Consolidate learning and plan the path forward.`, order_index: 2 },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Quiz fallback
// ---------------------------------------------------------------------------

/**
 * Returns 5 generic self-assessment MCQs. These are deliberately meta-cognitive
 * (asking about the student's understanding) rather than content-specific,
 * because we cannot generate content-accurate questions without AI.
 *
 * @param {string} skillName
 * @param {string} [difficulty="intermediate"]
 * @returns {{ questions: object[] }}
 */
export function getTemplateQuiz(skillName, difficulty = "intermediate") {
  return {
    questions: [
      {
        question_text: `Which of the following best describes ${skillName}?`,
        options: [
          `A fundamental programming concept`,
          `A type of hardware component`,
          `A project management methodology`,
          `A database query language`,
        ],
        correct_answer: `A fundamental programming concept`,
        difficulty,
      },
      {
        question_text: `What is the first step when learning ${skillName}?`,
        options: [
          `Understanding the basic terminology and concepts`,
          `Memorizing all syntax rules`,
          `Writing complex programs immediately`,
          `Skipping to advanced topics`,
        ],
        correct_answer: `Understanding the basic terminology and concepts`,
        difficulty: "beginner",
      },
      {
        question_text: `Why is practicing ${skillName} important?`,
        options: [
          `It builds muscle memory and deeper understanding`,
          `It is not important, reading is enough`,
          `Only exams require practice`,
          `Practice is only for beginners`,
        ],
        correct_answer: `It builds muscle memory and deeper understanding`,
        difficulty: "beginner",
      },
      {
        question_text: `What should you do when you encounter an error while working with ${skillName}?`,
        options: [
          `Read the error message carefully and debug step by step`,
          `Restart your computer`,
          `Delete all your code and start over`,
          `Ignore it and move on`,
        ],
        correct_answer: `Read the error message carefully and debug step by step`,
        difficulty: "intermediate",
      },
      {
        question_text: `How does ${skillName} relate to other programming concepts?`,
        options: [
          `It builds on prerequisites and enables more advanced topics`,
          `It is completely independent of all other concepts`,
          `It only relates to one other concept`,
          `It replaces all other concepts`,
        ],
        correct_answer: `It builds on prerequisites and enables more advanced topics`,
        difficulty,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Lesson content fallback
// ---------------------------------------------------------------------------

/**
 * Returns placeholder summary and key concepts for a lesson.
 *
 * @param {string} lessonTitle
 * @returns {{ ai_summary: string, key_concepts: string[], youtube_search_queries: string[] }}
 */
export function getTemplateLessonContent(lessonTitle) {
  return {
    ai_summary:
      `This lesson covers "${lessonTitle}". ` +
      `You will learn the core ideas behind this topic, see examples, ` +
      `and practice applying what you have learned. ` +
      `Take your time with each section and try the exercises before moving on. ` +
      `If you get stuck, use the tutor chat to ask questions.`,
    key_concepts: [
      `Understand the purpose and definition of ${lessonTitle}`,
      `Recognize where ${lessonTitle} is used in real programs`,
      `Practice writing simple examples related to ${lessonTitle}`,
    ],
    youtube_search_queries: [
      `${lessonTitle} tutorial for beginners`,
      `${lessonTitle} explained simply`,
      `${lessonTitle} programming example`,
    ],
  }
}

// ---------------------------------------------------------------------------
// Video library fallback
// ---------------------------------------------------------------------------

/**
 * Returns a small set of curated, evergreen educational YouTube videos
 * for core STEM / programming topics.
 *
 * These are well-known, high-quality channels whose videos are unlikely to
 * disappear. If the skill does not match a known topic, a generic set of
 * "learn to code" videos is returned.
 *
 * @param {string} skillName
 * @returns {{ videos: object[] }}
 */
export function getFallbackVideoLibrary(skillName) {
  const lower = (skillName || "").toLowerCase()

  // Topic-specific curated playlists / videos (YouTube IDs)
  const CURATED = {
    variables: [
      { title: "Variables in Programming — CS Basics", youtube_video_id: "TlBIO80ISWE", duration: "8 min" },
    ],
    loops: [
      { title: "Loops Explained — For, While, Do-While", youtube_video_id: "wxds6MAtUQ0", duration: "12 min" },
    ],
    functions: [
      { title: "Functions in Programming", youtube_video_id: "GQzFHp_GRBA", duration: "10 min" },
    ],
    arrays: [
      { title: "Arrays in Programming — Explained", youtube_video_id: "QwfvNVMjpfo", duration: "11 min" },
    ],
    pointers: [
      { title: "Pointers in C — Explained", youtube_video_id: "zuegQmMdy8M", duration: "15 min" },
    ],
    dsa: [
      { title: "Data Structures Easy to Advanced", youtube_video_id: "RBSGKlAvoiM", duration: "60 min" },
    ],
    oop: [
      { title: "Object Oriented Programming Concepts", youtube_video_id: "pTB0EiLXUC8", duration: "30 min" },
    ],
    python: [
      { title: "Python for Beginners — Full Course", youtube_video_id: "kqtD5dpn9C8", duration: "60 min" },
    ],
  }

  // Try to match
  for (const [key, videos] of Object.entries(CURATED)) {
    if (lower.includes(key)) {
      return {
        videos: videos.map((v) => ({
          ...v,
          difficulty_level: "beginner",
          relevance_score: 85,
        })),
      }
    }
  }

  // Generic fallback
  return {
    videos: [
      {
        title: `${skillName} — Introductory Tutorial`,
        youtube_video_id: "",
        duration: "15 min",
        difficulty_level: "beginner",
        relevance_score: 70,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Gap detection fallback
// ---------------------------------------------------------------------------

/**
 * Returns a minimal gap analysis when AI is unavailable.
 * Simply echoes back the skill name as a detected gap.
 *
 * @param {string} skillName
 * @returns {object}
 */
export function getTemplateGapDetection(skillName) {
  return {
    detected_gaps: skillName
      ? [{ skill_id: null, skill_name: skillName, severity: "moderate" }]
      : [],
    reasoning:
      "AI analysis is temporarily unavailable. A basic gap has been recorded based on your request. " +
      "You can retry later for a more detailed analysis.",
    should_ask_followup: false,
    followup_question: "",
  }
}

// ---------------------------------------------------------------------------
// Task planning fallback
// ---------------------------------------------------------------------------

/**
 * Returns a single-task plan when AI planning is unavailable.
 *
 * @param {string} skillName
 * @returns {{ tasks: object[], summary: string }}
 */
export function getTemplateTaskPlan(skillName) {
  return {
    tasks: [
      {
        skill_id: null,
        skill_name: skillName,
        title: `Learn ${skillName}`,
        description: `Complete the foundational course for ${skillName}.`,
        reason: "This skill was identified as a learning gap.",
        difficulty: "intermediate",
        priority: 1,
        estimated_time: "2 weeks",
      },
    ],
    summary: `A basic learning plan for ${skillName}. Retry when AI is available for a more detailed roadmap.`,
  }
}
