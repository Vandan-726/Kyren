// KYREN agent layer — runs SERVER-SIDE ONLY.
//
// This file was ported from the original client-side implementation. The prompts
// are unchanged; only the transport moved. Two things changed and both matter:
//
//   1. It no longer runs in the browser. XAI_API_KEY never reaches the client.
//   2. Usage/latency/cost logging is handled inside the xAI client itself
//      (server/config/xai.js -> recordUsage), so every retry and failure is
//      captured in ai_api_usage rather than only the happy path.
import { chat } from "../config/ai.js";
import {
    SKILLS_GRAPH,
    SKILL_DEPENDENCIES,
    getSkillById,
    getAllPrerequisites,
    getPrerequisiteChain,
    getMissingPrerequisites,
    getDirectPrerequisites,
    getDependentSkills,
} from "../lib/skillsGraph.js";

const LANG_NAME_MAP = {
    en: "English",
    hi: "Hindi (हिन्दी)",
    bn: "Bengali (বাংলা)",
    gu: "Gujarati (ગુજરાતી)",
    mr: "Marathi (मराठी)",
    ta: "Tamil (தமிழ்)",
    te: "Telugu (తెలుగు)",
    kn: "Kannada (ಕನ್ನಡ)",
    ml: "Malayalam (മലയാളം)",
    pa: "Punjabi (ਪੰਜਾਬੀ)",
    or: "Odia (ଓଡ଼ିଆ)",
    od: "Odia (ଓଡ଼ିଆ)",
    as: "Assamese (অসমীয়া)",
};

const LEARNING_TARGET_RULES = [
    { skillId: "dsa", patterns: [/data structures?/i, /\bdsa\b/i, /algorithms?/i] },
    { skillId: "oop", patterns: [/\boop\b/i, /object[- ]oriented/i, /\bclasses?\b/i, /\bobjects?\b/i, /inheritance/i, /polymorphism/i, /encapsulation/i] },
    { skillId: "cpp_basics", patterns: [/\bc\+\+\b/i, /\bcpp\b/i] },
    { skillId: "pointers", patterns: [/\bpointers?\b/i, /memory address/i, /address of/i] },
    { skillId: "arrays", patterns: [/\barrays?\b/i, /indexed collection/i] },
    { skillId: "functions", patterns: [/\bfunctions?\b/i, /recursion/i, /parameters?/i, /return value/i] },
    { skillId: "loops", patterns: [/\bloops?\b/i, /\bfor loop\b/i, /\bwhile loop\b/i, /do-?while/i] },
    { skillId: "conditions", patterns: [/\bif\b/i, /\belse\b/i, /\bswitch\b/i, /conditional/i] },
    { skillId: "variables", patterns: [/\bvariables?\b/i, /data types?/i, /\bints?\b/i, /\bfloats?\b/i, /\bchars?\b/i] },
    { skillId: "prog_fundamentals", patterns: [/programming/i, /programmer/i, /syntax/i, /compile/i, /compiler/i, /basics/i, /from scratch/i, /beginner/i] },
    { skillId: "python_basics", patterns: [/\bpython\b/i] },
    { skillId: "machine_learning", patterns: [/machine learning/i, /\bml\b/i] },
    { skillId: "data_analysis", patterns: [/data analysis/i, /\bpandas\b/i, /\bnumpy\b/i] },
];

const TARGET_PRIORITY = [
    "dsa",
    "oop",
    "cpp_basics",
    "pointers",
    "arrays",
    "functions",
    "loops",
    "conditions",
    "variables",
    "python_basics",
    "machine_learning",
    "data_analysis",
    "prog_fundamentals",
];

function normalizeConversationText(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim();
}

function inferTargetsFromText(text) {
    const combined = normalizeConversationText(text)
    if (!combined) return []

    const hits = []
    for (const rule of LEARNING_TARGET_RULES) {
        if (rule.patterns.some((pattern) => pattern.test(combined))) {
            hits.push(rule.skillId)
        }
    }

    for (const skillId of TARGET_PRIORITY) {
        if (hits.includes(skillId)) {
            return [skillId]
        }
    }

    return [...new Set(hits)]
}

function buildHeuristicGaps(targetSkillIds, existingGaps = []) {
    const existingKeys = new Set(
        (existingGaps || []).map((gap) => String(gap.skill_id || gap.skill_name || gap.gap_title || "").toLowerCase()),
    )

    const gaps = []
    const seen = new Set()
    for (const targetSkillId of targetSkillIds) {
        const chain = getPrerequisiteChain(targetSkillId)
        if (!chain.length) continue

        const explicitTarget = getSkillById(targetSkillId)
        const orderedChain = chain.filter(Boolean)

        orderedChain.forEach((skillId, index) => {
            const skill = getSkillById(skillId)
            if (!skill) return
            const key = String(skill.id || skillId).toLowerCase()
            const nameKey = String(skill.name || skill.skill_name || "").toLowerCase()
            if (existingKeys.has(key) || existingKeys.has(nameKey) || seen.has(key) || seen.has(nameKey)) return

            const isTarget = skillId === targetSkillId
            const severity =
                isTarget || index === 0
                    ? "critical"
                    : index <= 2
                        ? "high"
                        : "medium"

            gaps.push({
                title: skill.name,
                skillArea: skill.subject_area || skill.skill_category || "general",
                severity,
                confidence: isTarget ? 95 : Math.max(70, 95 - index * 6),
                reason: isTarget
                    ? `The student explicitly mentioned wanting to learn ${skill.name}.`
                    : `${skill.name} is a prerequisite for ${explicitTarget?.name || targetSkillId}.`,
                prerequisites: getDirectPrerequisites(skillId),
                skill_id: skillId,
                skill_name: skill.name,
            })

            seen.add(key)
            seen.add(nameKey)
        })
    }

    return gaps
}

/**
 * Invokes Grok with a JSON schema and returns parsed structured output.
 *
 * `agentName` becomes the ai_api_usage.request_type, which is what powers the
 * per-agent cost/latency breakdown in the analytics dashboard — so it must stay
 * stable and human-readable.
 *
 * `userId` is threaded through for per-user attribution. Agents that run from a
 * background job with no owner pass null, which is expected.
 */
async function callLLM(
    prompt,
    jsonSchema,
    agentName,
    provider = "Grok",
    { userId = null, fast = false, temperature = 0.7, system = null } = {},
) {
    return await chat({
        prompt,
        system,
        schema: jsonSchema,
        schemaName: agentName.replace(/\s+/g, "_").toLowerCase(),
        requestType: agentName,
        userId,
        fast,
        temperature,
    });
}

// === 1. LEARNING GAP AGENT ===
// Analyzes conversation/quiz/doubt input against the SkillDependency graph, outputs detected gaps.
export async function detectLearningGaps({ userMessage, context, conversationHistory = [], masteryScores, existingGaps, language = "en" }) {
    const combinedText = [
        context,
        userMessage,
        ...conversationHistory,
    ]
        .map((entry) => {
            if (typeof entry === "string") return entry
            if (entry && typeof entry === "object") {
                return `${entry.role || "message"}: ${entry.content || ""}`
            }
            return ""
        })
        .join("\n")

    const targetSkills = inferTargetsFromText(combinedText)
    const heuristicGaps = buildHeuristicGaps(targetSkills, existingGaps)
    const langName = LANG_NAME_MAP[language] || language || "English"

    if (heuristicGaps.length > 0) {
        const targetNames = targetSkills.map((skillId) => getSkillById(skillId)?.name || skillId).filter(Boolean)
        const nextQuestion = targetSkills.includes("dsa")
            ? "Have you studied any programming basics before, like variables, loops, or functions?"
            : "Have you already studied the basics for this topic, or should I start from the fundamentals?"

        return {
            detected_gaps: heuristicGaps,
            reasoning: targetNames.length
                ? `You mentioned ${targetNames.join(", ")}. I mapped that to the prerequisite chain so we can build the right learning path.`
                : "I detected the likely learning target from your message and mapped the prerequisites.",
            should_ask_followup: conversationHistory.length === 0,
            followup_question: conversationHistory.length === 0 ? nextQuestion : "",
        }
    }

    const skillsList = SKILLS_GRAPH.map(s => `- ${s.id}: ${s.name} (${s.subject_area}) — ${s.description}`).join("\n");
    const depsList = SKILL_DEPENDENCIES.map(d => `${getSkillById(d.skill_id)?.name} requires ${getSkillById(d.prerequisite_skill_id)?.name}`).join("\n");
    const masteryInfo = masteryScores?.map(m => `${m.skill_name}: ${m.percentage}% (${m.status})`).join("\n") || "No mastery data yet";
    const existingGapNames = existingGaps?.map(g => g.skill_name).join(", ") || "None";

    const prompt = `You are KYREN's Learning Gap Agent. Your job is to analyze what a student says and detect which STEM skills they are missing.

Student's Preferred Language: ${langName}
CRITICAL LANGUAGE INSTRUCTION: Write all 'reasoning' and 'followup_question' strictly in ${langName}.

Available skills:
${skillsList}

Prerequisite relationships:
${depsList}

Student's current mastery:
${masteryInfo}

Already-detected gaps: ${existingGapNames}

Context: ${typeof context === "string" ? context : "AI Learning Companion conversation"}
Conversation history:
${conversationHistory.length > 0 ? conversationHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n") : "None"}

Student said: "${userMessage}"

Analyze this statement and identify which skills the student is missing or needs to learn. Consider the prerequisite chain — if a student wants to learn DSA but doesn't know C, they need Variables, Conditions, Loops, Functions, Arrays, Pointers, C++, OOP before DSA.
If the user is answering a follow-up question from the prior turn, use the conversation history to preserve the same learning goal.
If the message is short, ambiguous, or phrased as a question, infer the most likely learning target instead of rejecting it.
Do not say that no gaps can be detected when the user has clearly named a target skill.

CRITICAL: If the student's message is entirely unrelated to STEM, education, or learning (e.g., asking about politics, pop culture, or unrelated tasks), set 'is_out_of_scope' to true. Provide a polite, professional refusal in 'reasoning', and set 'should_ask_followup' to true with a 'followup_question' offering help with STEM subjects instead. Return an empty array for 'detected_gaps'.

Return a JSON object with:
- detected_gaps: array of objects with skill_id, skill_name, severity ("critical" for prerequisites blocking a stated goal, "moderate" for gaps that should be filled, "minor" for nice-to-haves)
- reasoning: brief explanation of why these gaps were detected
- should_ask_followup: boolean — true if the agent should ask a clarifying question before generating the full path
- followup_question: the clarifying question if should_ask_followup is true
- is_out_of_scope: boolean — true if the request is completely unrelated to STEM/learning`;

    const schema = {
        type: "object",
        properties: {
            detected_gaps: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        skill_id: { type: "string" },
                        skill_name: { type: "string" },
                        severity: { type: "string", enum: ["critical", "moderate", "minor"] },
                    },
                },
            },
            reasoning: { type: "string" },
            should_ask_followup: { type: "boolean" },
            followup_question: { type: "string" },
            is_out_of_scope: { type: "boolean" },
        },
    };

    return await callLLM(prompt, schema, "Learning Gap Agent", "Grok");
}

// === 2. TASK PLANNING AGENT ===
// Converts gaps into LearningTasks, computes priority/order
export async function planLearningTasks({ detectedGaps, masteryScores, userGoal, language = "en" }) {
    const gapsInfo = detectedGaps.map(g => `- ${g.skill_name} (${g.skill_id}): severity ${g.severity}`).join("\n");
    const masteryInfo = masteryScores?.map(m => `${m.skill_name}: ${m.percentage}% (${m.status})`).join("\n") || "No mastery data";
    const langName = LANG_NAME_MAP[language] || language || "English";

    const prompt = `You are KYREN's Task Planning Agent. Given detected learning gaps and the student's current mastery, create a prioritized learning task list.

Student's Preferred Language: ${langName}
CRITICAL LANGUAGE INSTRUCTION: Write all task 'title', 'description', 'reason', and 'summary' strictly in ${langName}.

Detected gaps:
${gapsInfo}

Current mastery:
${masteryInfo}

Student's goal: ${userGoal || "Not specified"}

Create learning tasks ordered by prerequisite priority. A student must learn prerequisites before the skill that depends on them. For example, to learn DSA, they need: Variables → Conditions → Loops → Functions → Arrays → Pointers → C++ → OOP → DSA.

For each task, provide:
- skill_id: the skill this task teaches
- title: a clear task title (e.g., "Learn Variables in C")
- description: what the student will learn
- reason: why this task is needed (reference the prerequisite chain or the student's goal)
- difficulty: beginner/intermediate/advanced
- priority: integer starting at 1 (1 = first to learn)
- estimated_time: realistic time estimate

Return as JSON with an array of tasks sorted by priority.`;

    const schema = {
        type: "object",
        properties: {
            tasks: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        skill_id: { type: "string" },
                        skill_name: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        reason: { type: "string" },
                        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                        priority: { type: "number" },
                        estimated_time: { type: "string" },
                    },
                },
            },
            summary: { type: "string" },
        },
    };

    return await callLLM(prompt, schema, "Task Planning Agent", "Grok");
}

// === 3. COURSE ARCHITECT AGENT ===
// Given an approved task, produces Course → Modules → Lessons structure
export async function architectCourse({ task, userLanguage, userGoal }) {
    const skill = getSkillById(task.skill_id) || { name: task.skill_name, description: "" };

    const prompt = `You are KYREN's Course Architect Agent. Design a complete course structure for the following learning task.

Task: ${task.title}
Skill: ${skill.name}
Description: ${task.description || skill.description}
Difficulty: ${task.difficulty}
Student's learning goal: ${userGoal || "Not specified"}
Language: ${userLanguage || "en"}

Create a course with 2-4 modules, each with 2-4 lessons. Structure the progression from basics to advanced within this skill. Each lesson should teach one core concept.

Return JSON with:
- course: { title, description, difficulty, estimated_duration, learning_objectives (array of 3-5 strings) }
- modules: array of { title, objective, mastery_threshold (number 0-100), lessons: array of { title, description, order_index } }`;

    const schema = {
        type: "object",
        properties: {
            course: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    difficulty: { type: "string" },
                    estimated_duration: { type: "string" },
                    learning_objectives: { type: "array", items: { type: "string" } },
                },
            },
            modules: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        objective: { type: "string" },
                        mastery_threshold: { type: "number" },
                        lessons: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    order_index: { type: "number" },
                                },
                            },
                        },
                    },
                },
            },
        },
    };

    return await callLLM(prompt, schema, "Course Architect Agent", "Grok");
}

// === 4. CONTENT AGENT ===
// Generates lesson summaries, key concepts, and selects YouTube videos
export async function generateLessonContent({ lesson, courseTitle, moduleTitle, difficulty, language }) {
    const prompt = `You are KYREN's Content Agent. Generate rich educational content for this lesson.

Lesson: ${lesson.title}
Description: ${lesson.description}
Course: ${courseTitle}
Module: ${moduleTitle}
Difficulty: ${difficulty}
Language: ${language || "en"}

Generate:
1. ai_summary: A comprehensive 200-300 word summary explaining the concept clearly, suitable for a student at this difficulty level.
2. key_concepts: 3-7 key takeaways as an array of strings (each a complete sentence).
3. youtube_search_queries: 3-4 YouTube search queries that would find the best educational videos for this lesson, ordered from beginner to advanced. Use specific terms that would surface high-quality educational content.

Return as JSON.`;

    const schema = {
        type: "object",
        properties: {
            ai_summary: { type: "string" },
            key_concepts: { type: "array", items: { type: "string" } },
            youtube_search_queries: { type: "array", items: { type: "string" } },
        },
    };

    return await callLLM(prompt, schema, "Content Agent", "Grok");
}

// Generate curated YouTube video suggestions for a lesson
export async function generateVideoSuggestions({ lesson, searchQueries, difficulty, language }) {
    const prompt = `You are KYREN's Content Agent. For the lesson "${lesson.title}", suggest 3-4 YouTube videos that would be excellent educational resources.

Lesson description: ${lesson.description}
Difficulty: ${difficulty}
Language: ${language || "en"}

Search context: ${searchQueries?.join(", ") || lesson.title}

For each video, provide:
- title: a descriptive title for what the video should cover
- youtube_video_id: leave as empty string (will be filled by search)
- duration: estimated duration (e.g., "10-15 min")
- difficulty_level: beginner/intermediate/advanced (ordered beginner → advanced)
- relevance_score: 0-100 based on how relevant it is

Order from beginner-friendly to advanced. Return as JSON.`;

    const schema = {
        type: "object",
        properties: {
            videos: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        youtube_video_id: { type: "string" },
                        duration: { type: "string" },
                        difficulty_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                        relevance_score: { type: "number" },
                    },
                },
            },
        },
    };

    return await callLLM(prompt, schema, "Content Agent", "Grok");
}

// === 5. ASSESSMENT AGENT ===
// Generates quiz questions per lesson/module, calibrated to difficulty
export async function generateQuiz({ lesson, courseTitle, moduleTitle, difficulty, numQuestions = 5 }) {
    const prompt = `You are KYREN's Assessment Agent. Generate ${numQuestions} quiz questions for this lesson.

Lesson: ${lesson.title}
Description: ${lesson.description || lesson.ai_summary || "N/A"}
Key concepts: ${lesson.key_concepts?.join("; ") || "N/A"}
Course: ${courseTitle}
Module: ${moduleTitle}
Difficulty: ${difficulty}

Generate ${numQuestions} multiple-choice questions with 4 options each. Questions should test understanding, not just memorization. Include a mix of conceptual and application questions appropriate for the difficulty level.

Return JSON with an array of questions, each having: question_text, options (array of 4 strings), correct_answer (the exact text of the correct option), difficulty.`;

    const schema = {
        type: "object",
        properties: {
            questions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        question_text: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correct_answer: { type: "string" },
                        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                    },
                },
            },
        },
    };

    return await callLLM(prompt, schema, "Assessment Agent", "Grok");
}

// === 5b. MORNING CHECK-IN AGENT ===
// Generates 3 quick questions targeting a specific skill (not lesson-bound), for daily review
export async function generateSkillCheckIn({ skillName, skillDescription, difficulty, currentMastery }) {
    const prompt = `You are KYREN's Assessment Agent. Generate exactly 3 quick quiz questions for a morning mastery check-in.

Skill: ${skillName}
Description: ${skillDescription || "N/A"}
Difficulty: ${difficulty || "beginner"}
Student's current mastery: ${currentMastery ?? "Unknown"}%

Since this is a daily check-in to keep knowledge sharp, focus on core concepts and fundamentals of this skill. If the student's mastery is low, use easier questions; if higher, use slightly more challenging application questions.

Return JSON with an array of exactly 3 questions, each having: question_text, options (array of 4 strings), correct_answer (the exact text of the correct option), difficulty.`;

    const schema = {
        type: "object",
        properties: {
            questions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        question_text: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correct_answer: { type: "string" },
                        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                    },
                },
            },
        },
    };

    return await callLLM(prompt, schema, "Assessment Agent", "Grok");
}

// === 6. TUTOR AGENT ===
// Lesson-scoped tutor; contextual with lesson objective, videos, mastery, past mistakes
export async function tutorRespond({
    userMessage,
    lesson,
    courseTitle,
    moduleTitle,
    masteryScore,
    pastMistakes,
    language,
}) {
    const prompt = `You are KYREN's AI Tutor, scoped to a specific lesson. You use the Socratic method — ask guiding questions before giving direct answers when appropriate.

Lesson: ${lesson.title}
Lesson description: ${lesson.description}
AI Summary: ${lesson.ai_summary || "N/A"}
Key concepts: ${lesson.key_concepts?.join("; ") || "N/A"}
Course: ${courseTitle}
Module: ${moduleTitle}

Student's current mastery for this skill: ${masteryScore || "Not assessed yet"}%
Past quiz mistakes on this lesson: ${pastMistakes?.join("; ") || "None recorded"}

Student question: "${userMessage}"
Respond in: ${language || "en"}

Guidelines:
- Use the Socratic method: if the student asks for a direct answer, first guide them with a question that helps them discover it themselves
- Reference the specific concepts from this lesson
- If the student's mastery is low, simplify your explanations
- If their mastery is high, you can introduce more advanced perspectives
- Keep responses concise (150-250 words)
- If the student's question reveals a gap, note it

Return your response as plain text.`;

    return await callLLM(prompt, null, "Tutor Agent", "Grok");
}

// === 7. RECOMMENDATION AGENT ===
// After course completion, picks next skill/course from the dependency graph + mastery data
export async function recommendNextSkill({ completedSkills, masteryScores, userGoal, userInterests }) {
    const masteryInfo = masteryScores.map(m => `${m.skill_name}: ${m.percentage}% (${m.status})`).join("\n");
    const completedInfo = completedSkills.join(", ") || "None";
    const depsInfo = SKILL_DEPENDENCIES.map(d => `${getSkillById(d.skill_id)?.name} requires ${getSkillById(d.prerequisite_skill_id)?.name}`).join("\n");

    const prompt = `You are KYREN's Recommendation Agent. Based on the student's completed skills, mastery scores, goals, and interests, recommend the next skill to learn.

Completed skills: ${completedInfo}
Current mastery:
${masteryInfo}

Student's goal: ${userGoal || "Not specified"}
Student's interests: ${userInterests?.join(", ") || "Not specified"}

Prerequisite graph:
${depsInfo}

Recommend the next skill that:
1. Has all prerequisites met (or is the next logical step)
2. Aligns with the student's goal and interests
3. Builds on what they've already mastered

Return JSON with:
- recommended_skill_id
- recommended_skill_name
- reason: a personalized explanation of why this is the right next step
- estimated_time: rough time to master this skill`;

    const schema = {
        type: "object",
        properties: {
            recommended_skill_id: { type: "string" },
            recommended_skill_name: { type: "string" },
            reason: { type: "string" },
            estimated_time: { type: "string" },
        },
    };

    return await callLLM(prompt, schema, "Recommendation Agent", "Grok");
}

// === 8. ANALYTICS AGENT ===
// Generates weekly natural-language insights from real MasteryScore/QuizAttempt history
export async function generateAnalyticsInsights({ masteryScores, quizAttempts, tasksCompleted, learningTime, streak }) {
    const masteryInfo = masteryScores?.map(m => `${m.skill_name}: ${m.percentage}% (${m.status})`).join("\n") || "No data";
    const quizInfo = quizAttempts?.length ? `${quizAttempts.length} attempts, avg score ${Math.round(quizAttempts.reduce((a, q) => a + q.score, 0) / quizAttempts.length)}%` : "No quizzes taken";
    const tasksInfo = `${tasksCompleted || 0} tasks completed`;

    const prompt = `You are KYREN's Analytics Agent. Generate 2-3 personalized natural-language insights from this student's learning data this week.

Mastery scores:
${masteryInfo}

Quiz performance: ${quizInfo}
Tasks: ${tasksInfo}
Total learning time: ${learningTime || "Unknown"} minutes
Current streak: ${streak || 0} days

Generate insights that:
- Highlight improvement (e.g., "You improved X by Y% this week")
- Identify weak areas that need attention
- Celebrate progress and suggest specific next actions
- Are motivational but grounded in the real data above

Return JSON with an array of insight strings, each 1-2 sentences.`;

    const schema = {
        type: "object",
        properties: {
            insights: { type: "array", items: { type: "string" } },
        },
    };

    return await callLLM(prompt, schema, "Analytics Agent", "Grok");
}

// === DOUBT SOLVER AGENT (global) ===
export async function solveDoubt({ userMessage, language = "en", skillContext }) {
    const langName = LANG_NAME_MAP[language] || language || "English";
    const prompt = `You are KYREN's AI Doubt Solver. A student has asked a STEM question.

Student's Preferred Language: ${langName}
CRITICAL LANGUAGE INSTRUCTION: Answer strictly in ${langName}. Write all 'explanation', 'example', and 'mini_question' in ${langName}.

Student's question: "${userMessage}"
${skillContext ? `Related skill context: ${skillContext}` : ""}

Provide:
1. A clear, simple explanation (150-200 words) suitable for a student
2. A concrete example that illustrates the concept
3. An optional mini practice question the student can try

If the question reveals a fundamental learning gap, set "potential_gap" to true and suggest what skill is missing.

CRITICAL: If the question is entirely unrelated to STEM, education, or the learning platform (e.g., politics, unrelated general knowledge, personal advice), set 'is_out_of_scope' to true. Provide a polite, professional refusal in the 'explanation' field (e.g. "I am an AI Doubt Solver focused on STEM subjects. I cannot answer this question. Please ask me about math, science, or programming!"). Omit the example and mini_question.

Return JSON with: explanation, example, mini_question, potential_gap (boolean), gap_skill (string if potential_gap is true), is_out_of_scope (boolean).`;

    const schema = {
        type: "object",
        properties: {
            explanation: { type: "string" },
            example: { type: "string" },
            mini_question: { type: "string" },
            potential_gap: { type: "boolean" },
            gap_skill: { type: "string" },
            is_out_of_scope: { type: "boolean" },
        },
    };

    return await callLLM(prompt, schema, "Doubt Solver Agent", "Grok");
}

// === MICRO MODULE AGENT ===
// Generates a "[Skill] in 5 Minutes" micro-module for recovery / quick review
export async function generateMicroModule({ skill, triggerReason, language }) {
    const prompt = `You are KYREN's Micro-Module Generator. Create a quick "5-minute" learning module for a student who is struggling.

Skill: ${skill.name}
Description: ${skill.description}
Trigger reason: ${triggerReason}
Language: ${language || "en"}

Create a micro-module with:
1. explanation: A simple, clear 100-word explanation of the core concept
2. analogy: A relatable real-world analogy
3. example: A concrete worked example
4. interactive_question: A question that checks understanding (not multiple choice, a thinking question)
5. mini_quiz_question: A simple multiple choice question
6. mini_quiz_options: 4 options
7. mini_quiz_answer: the correct option text

Keep everything beginner-friendly and concise. Return as JSON.`;

    const schema = {
        type: "object",
        properties: {
            title: { type: "string" },
            explanation: { type: "string" },
            analogy: { type: "string" },
            example: { type: "string" },
            interactive_question: { type: "string" },
            mini_quiz_question: { type: "string" },
            mini_quiz_options: { type: "array", items: { type: "string" } },
            mini_quiz_answer: { type: "string" },
        },
    };

    return await callLLM(prompt, schema, "Micro Module Agent", "Grok");
}

// === PATH SIMULATOR AGENT ===
export async function simulatePath({ targetSkill, masteryScores, userGoal }) {
    const skill = getSkillById(targetSkill);
    const masteryInfo = masteryScores.map(m => `${m.skill_name}: ${m.percentage}% (${m.status})`).join("\n");
    const missing = getMissingPrerequisites(targetSkill, masteryScores);
    const missingNames = missing.map(id => getSkillById(id)?.name).join(", ");

    const prompt = `You are KYREN's Learning Path Simulator. A student wants to learn "${skill?.name || targetSkill}".

Current mastery:
${masteryInfo}

Missing prerequisites: ${missingNames || "None — ready to learn!"}
Student's goal: ${userGoal || "Not specified"}

Compute a realistic learning path:
1. List current skills they already have (mastery > 50%)
2. List missing prerequisites in order
3. Estimate time for each step
4. Suggest milestones along the way

Return JSON with: current_skills (array), missing_prerequisites (ordered array of {skill_id, skill_name, estimated_time}), total_estimated_time, milestones (array of strings).`;

    const schema = {
        type: "object",
        properties: {
            current_skills: { type: "array", items: { type: "string" } },
            missing_prerequisites: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        skill_id: { type: "string" },
                        skill_name: { type: "string" },
                        estimated_time: { type: "string" },
                    },
                },
            },
            total_estimated_time: { type: "string" },
            milestones: { type: "array", items: { type: "string" } },
        },
    };

    return await callLLM(prompt, schema, "Path Simulator Agent", "Grok");
}

// === NOTES AGENT ===
// "Ask My Notes" — retrieval-based Q&A over the student's own saved notes
export async function askMyNotes({ question, notes }) {
    const notesContent = notes.map((n, i) => `Note ${i + 1}${n.pinned ? " [Pinned]" : ""}:\n${n.content}`).join("\n\n---\n\n");

    const prompt = `You are KYREN's Notes Q&A Agent. The student has asked a question. Answer based ONLY on their saved notes below. If the answer is not in the notes, say so clearly.

Student's question: "${question}"

Student's saved notes:
${notesContent}

Provide a clear answer that references which notes contain the relevant information. Return as JSON with: answer (string), source_notes (array of indices referencing the notes used).`;

    const schema = {
        type: "object",
        properties: {
            answer: { type: "string" },
            source_notes: { type: "array", items: { type: "number" } },
        },
    };

    return await callLLM(prompt, schema, "Notes Agent", "Grok");
}

// Generate notes from lesson content
export async function generateNotesFromLesson({ lesson, courseTitle }) {
    const prompt = `You are KYREN's Notes Generator. Create structured study notes for this lesson.

Lesson: ${lesson.title}
Description: ${lesson.description}
AI Summary: ${lesson.ai_summary || "N/A"}
Key concepts: ${lesson.key_concepts?.join("; ") || "N/A"}
Course: ${courseTitle}

Generate well-organized study notes with:
- A brief overview (2-3 sentences)
- Key definitions (if any)
- Important points (bullet format)
- A quick reference summary

Return as a single text string with markdown formatting.`;

    return await callLLM(prompt, null, "Notes Agent", "Grok");
}

// Summarize a student's notes
export async function summarizeNotes({ notes }) {
    const notesContent = notes.map(n => n.content).join("\n\n---\n\n");
    const prompt = `Summarize these study notes into a concise overview (150-200 words). Highlight the most important concepts:

${notesContent}

Return as a single text string.`;

    return await callLLM(prompt, null, "Notes Agent", "Grok");
}

// === 16. FLASHCARD GENERATION AGENT (Spaced Repetition) ===
// Auto-generates flashcards from a lesson's key_concepts for the SM-2 review engine.
export async function generateFlashcards({ lesson, courseTitle }) {
    const prompt = `You are KYREN's Flashcard Generator. Create study flashcards from this lesson's key concepts.

Lesson: ${lesson.title}
Description: ${lesson.description || ""}
AI Summary: ${lesson.ai_summary || "N/A"}
Key Concepts: ${(lesson.key_concepts || []).join(", ")}
Course: ${courseTitle || "N/A"}

For each key concept, create exactly one flashcard with:
- "concept": the concept name (short)
- "front": a clear, concise question or prompt that tests understanding of the concept
- "back": a clear, student-friendly answer (2-3 sentences max)

Return a JSON object: { "flashcards": [{ "concept": "...", "front": "...", "back": "..." }] }`;

    const schema = {
        type: "object",
        properties: {
            flashcards: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        concept: { type: "string" },
                        front: { type: "string" },
                        back: { type: "string" },
                    },
                },
            },
        },
    };

    return await callLLM(prompt, schema, "Flashcard Agent", "Grok");
}
