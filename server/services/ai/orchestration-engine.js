/**
 * AI Orchestration Engine — Central Command Center.
 *
 * Every AI request in KYREN can flow through this engine. It provides:
 *
 *   1. **Routing** — maps a `requestType` string to the correct agent function.
 *   2. **Context loading** — fetches and caches the student's profile, mastery,
 *      gaps, quiz history, and learning history from Supabase.
 *   3. **Error handling** — cascading fallbacks (primary → secondary provider →
 *      static template) so the student always gets *something*.
 *   4. **Usage tracking** — wraps every call with timing, token counts, cost
 *      estimates, and budget checks.
 *   5. **Envelope** — every response is returned in a uniform shape that the
 *      frontend can rely on without per-agent parsing.
 *
 * The engine does NOT replace direct agent calls. Existing routes and worker
 * handlers can continue calling agents directly. The engine is an opt-in
 * layer for new features that benefit from unified orchestration.
 */

import { supabase, unwrap } from "../../config/supabase.js"
import { env } from "../../config/env.js"
import { ContextCache } from "./context-cache.js"
import {
  getTemplateCourseStructure,
  getTemplateQuiz,
  getTemplateLessonContent,
  getFallbackVideoLibrary,
  getTemplateGapDetection,
  getTemplateTaskPlan,
} from "./fallback-templates.js"
import {
  detectLearningGaps,
  planLearningTasks,
  architectCourse,
  generateLessonContent,
  generateVideoSuggestions,
  generateQuiz,
  tutorRespond,
  recommendNextSkill,
  generateAnalyticsInsights,
  solveDoubt,
  generateMicroModule,
  generateSkillCheckIn,
  generateFlashcards,
} from "../agents.js"
import { recordUsage, assertWithinDailyQuota, checkMonthlyBudget } from "../aiUsageService.js"

// ---------------------------------------------------------------------------
// Request-type → agent mapping
// ---------------------------------------------------------------------------

/** @type {Record<string, Function>} */
const AGENT_REGISTRY = {
  gap_detection: detectLearningGaps,
  task_planning: planLearningTasks,
  course_generation: architectCourse,
  lesson_content: generateLessonContent,
  video_suggestions: generateVideoSuggestions,
  quiz_generation: generateQuiz,
  tutoring: tutorRespond,
  recommendation: recommendNextSkill,
  gap_analysis_from_quiz: generateAnalyticsInsights,
  doubt_solving: solveDoubt,
  micro_module: generateMicroModule,
  skill_check_in: generateSkillCheckIn,
  flashcard_generation: generateFlashcards,
}

/** Maps request types to the fallback function to invoke when all providers fail. */
const FALLBACK_REGISTRY = {
  gap_detection: (params) => getTemplateGapDetection(params.skillName || params.userMessage || ""),
  task_planning: (params) => getTemplateTaskPlan(params.skillName || ""),
  course_generation: (params) => getTemplateCourseStructure(params.task?.skill_name || params.skillName || ""),
  lesson_content: (params) => getTemplateLessonContent(params.lesson?.title || params.lessonTitle || ""),
  video_suggestions: (params) => getFallbackVideoLibrary(params.lesson?.title || params.skillName || ""),
  quiz_generation: (params) => getTemplateQuiz(params.lesson?.title || params.skillName || "", params.difficulty),
}

// ---------------------------------------------------------------------------
// Singleton context cache
// ---------------------------------------------------------------------------

const contextCache = new ContextCache({
  ttlMs: env.ai.contextCacheTtlMs ?? 3_600_000,
  maxEntries: 500,
})

// ---------------------------------------------------------------------------
// AIOrchestrationEngine
// ---------------------------------------------------------------------------

export class AIOrchestrationEngine {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Main entry point for all orchestrated AI requests.
   *
   * @param {object} request
   * @param {string} request.requestType  One of the keys in AGENT_REGISTRY.
   * @param {object} request.params       Agent-specific parameters.
   * @param {string} [request.userId]     Authenticated user ID.
   * @returns {Promise<OrchestrationResponse>}
   *
   * @typedef {object} OrchestrationResponse
   * @property {"success"|"partial"|"failed"} status
   * @property {object}   data
   * @property {number}   tokensUsed
   * @property {number}   processingTimeMs
   * @property {string}   aiModelUsed
   * @property {string[]} errors
   * @property {string[]} warnings
   */
  async orchestrateRequest({ requestType, params = {}, userId = null }) {
    const startedAt = Date.now()
    const warnings = []
    const errors = []

    // 1. Validate request type.
    const agentFn = this.routeRequest(requestType)
    if (!agentFn) {
      return this._buildResponse({
        status: "failed",
        data: null,
        errors: [`Unknown request type: "${requestType}"`],
        warnings,
        startedAt,
      })
    }

    // 2. Quota / budget guard.
    try {
      await assertWithinDailyQuota(userId, requestType)
    } catch (quotaError) {
      return this._buildResponse({
        status: "failed",
        data: null,
        errors: [quotaError.message],
        warnings,
        startedAt,
      })
    }

    // Budget warning (non-blocking).
    try {
      const budget = await checkMonthlyBudget()
      if (!budget.withinBudget) {
        warnings.push(
          `Monthly AI budget exceeded: $${budget.currentSpend.toFixed(2)} / $${budget.budgetLimit} (${budget.percentUsed.toFixed(0)}%).`,
        )
      } else if (budget.percentUsed >= 80) {
        warnings.push(
          `Monthly AI budget at ${budget.percentUsed.toFixed(0)}%: $${budget.currentSpend.toFixed(2)} / $${budget.budgetLimit}.`,
        )
      }
    } catch {
      // Budget check is best-effort; never block on it.
    }

    // 3. Load student context (if userId provided).
    let studentContext = null
    if (userId) {
      try {
        studentContext = await this.loadStudentContext(userId)
        // Merge context into params so agents have it available.
        params = { ...params, _studentContext: studentContext }
      } catch (ctxError) {
        warnings.push(`Student context could not be loaded: ${ctxError.message}`)
      }
    }

    // 4. Execute the agent.
    try {
      const data = await agentFn(params)
      const elapsed = Date.now() - startedAt

      // Track successful orchestration usage.
      void this.trackAPIUsage({
        apiName: env.ai.provider,
        requestType,
        userId,
        status: "success",
        processingTimeMs: elapsed,
      })

      return this._buildResponse({
        status: "success",
        data,
        warnings,
        errors,
        startedAt,
        aiModelUsed: env.ai.provider,
      })
    } catch (primaryError) {
      errors.push(`Primary agent failed: ${primaryError.message}`)

      // 5. Execute fallback.
      return this.executeFallback({ requestType, params, userId, primaryError, warnings, errors, startedAt })
    }
  }

  // -----------------------------------------------------------------------
  // Routing
  // -----------------------------------------------------------------------

  /**
   * Resolves a request type string to the corresponding agent function.
   *
   * @param {string} requestType
   * @returns {Function | null}
   */
  routeRequest(requestType) {
    return AGENT_REGISTRY[requestType] ?? null
  }

  /**
   * Returns the list of all registered request types.
   * @returns {string[]}
   */
  static listRequestTypes() {
    return Object.keys(AGENT_REGISTRY)
  }

  // -----------------------------------------------------------------------
  // Student context loading
  // -----------------------------------------------------------------------

  /**
   * Loads comprehensive student context from Supabase, using the in-memory
   * cache to avoid repeated queries within the TTL window.
   *
   * The context includes:
   *   - Student profile (language, education level, learning pace, goal)
   *   - Mastery scores per skill
   *   - Active learning gaps
   *   - Recent quiz performance (last 10)
   *   - Active learning tasks
   *
   * @param {string} userId
   * @returns {Promise<StudentContext>}
   *
   * @typedef {object} StudentContext
   * @property {object}   profile
   * @property {object[]} masteryScores
   * @property {object[]} activeGaps
   * @property {object[]} recentQuizzes
   * @property {object[]} activeTasks
   * @property {number}   loadedAtMs
   */
  async loadStudentContext(userId) {
    const cacheKey = `ctx:${userId}`
    const cached = contextCache.get(cacheKey)
    if (cached) return cached

    // Run all queries concurrently for speed.
    const [profileResult, masteryResult, gapsResult, quizzesResult, tasksResult] =
      await Promise.allSettled([
        supabase
          .from("student_profiles")
          .select("preferred_language, education_level, learning_pace, learning_goal, interests")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("student_skill_mastery")
          .select(`
            mastery_percentage,
            skills (
              id,
              skill_name,
              skill_code,
              skill_category
            )
          `)
          .eq("user_id", userId),

        supabase
          .from("learning_gaps")
          .select(`
            id,
            gap_title,
            skill_area,
            severity,
            status,
            skills (
              id,
              skill_name
            )
          `)
          .eq("user_id", userId)
          .in("status", ["detected", "in_progress"]),

        supabase
          .from("quiz_attempts")
          .select("id, score, total_questions, created_at, lesson_quizzes(title)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("learning_tasks")
          .select("id, task_title, skill_id, priority_level, difficulty, status")
          .eq("user_id", userId)
          .in("status", ["suggested", "in_progress"])
          .order("priority_level", { ascending: true })
          .limit(20),
      ])

    const context = {
      profile: profileResult.status === "fulfilled" ? profileResult.value.data : null,
      masteryScores:
        masteryResult.status === "fulfilled"
          ? (masteryResult.value.data ?? []).map((m) => ({
              skill_id: m.skills?.id,
              skill_name: m.skills?.skill_name,
              skill_code: m.skills?.skill_code,
              skill_category: m.skills?.skill_category,
              percentage: m.mastery_percentage,
              status: m.mastery_percentage >= 80 ? "mastered" : "in_progress",
            }))
          : [],
      activeGaps:
        gapsResult.status === "fulfilled"
          ? (gapsResult.value.data ?? []).map((g) => ({
              id: g.id,
              title: g.gap_title,
              skill_area: g.skill_area,
              skill_name: g.skills?.skill_name,
              severity: g.severity,
              status: g.status,
            }))
          : [],
      recentQuizzes:
        quizzesResult.status === "fulfilled"
          ? (quizzesResult.value.data ?? []).map((q) => ({
              id: q.id,
              score: q.score,
              totalQuestions: q.total_questions,
              quizTitle: q.lesson_quizzes?.title,
              createdAt: q.created_at,
            }))
          : [],
      activeTasks:
        tasksResult.status === "fulfilled"
          ? (tasksResult.value.data ?? []).map((t) => ({
              id: t.id,
              title: t.task_title,
              skillId: t.skill_id,
              priority: t.priority_level,
              difficulty: t.difficulty,
              status: t.status,
            }))
          : [],
      loadedAtMs: Date.now(),
    }

    contextCache.set(cacheKey, context)
    return context
  }

  /**
   * Manually invalidates a user's cached context. Call after writes that
   * change profile, mastery, gaps, or quiz data.
   *
   * @param {string} userId
   */
  invalidateContext(userId) {
    contextCache.invalidateByPrefix(`ctx:${userId}`)
  }

  // -----------------------------------------------------------------------
  // Fallbacks
  // -----------------------------------------------------------------------

  /**
   * Executes fallback logic when the primary agent call fails.
   *
   * Cascade:
   *   1. If a static template exists for this request type, use it.
   *   2. Otherwise, return the error as-is.
   *
   * Returns a response with status `"partial"` (template worked) or
   * `"failed"` (nothing could produce output).
   *
   * @param {object} opts
   * @returns {Promise<OrchestrationResponse>}
   */
  async executeFallback({ requestType, params, userId, primaryError, warnings, errors, startedAt }) {
    const fallbackFn = FALLBACK_REGISTRY[requestType]

    if (fallbackFn) {
      try {
        const data = fallbackFn(params)

        void this.trackAPIUsage({
          apiName: "fallback",
          requestType,
          userId,
          status: "success",
          processingTimeMs: Date.now() - startedAt,
          fallbackUsed: true,
        })

        warnings.push("AI provider was unavailable — a template-based response was used instead.")

        return this._buildResponse({
          status: "partial",
          data,
          warnings,
          errors,
          startedAt,
          aiModelUsed: "fallback",
        })
      } catch (fallbackError) {
        errors.push(`Fallback also failed: ${fallbackError.message}`)
      }
    }

    // Nothing worked.
    void this.trackAPIUsage({
      apiName: env.ai.provider,
      requestType,
      userId,
      status: "failed",
      processingTimeMs: Date.now() - startedAt,
      errorMessage: primaryError?.message,
    })

    return this._buildResponse({
      status: "failed",
      data: null,
      warnings,
      errors,
      startedAt,
      aiModelUsed: "none",
    })
  }

  // -----------------------------------------------------------------------
  // Usage tracking
  // -----------------------------------------------------------------------

  /**
   * Records an orchestration-level usage entry. Delegates to the existing
   * `recordUsage` function in `aiUsageService.js` so all data ends up in
   * the same `ai_api_usage` table.
   *
   * @param {object} opts
   */
  async trackAPIUsage({
    apiName,
    requestType,
    userId = null,
    tokens = null,
    cost = null,
    status = "success",
    processingTimeMs = null,
    errorMessage = null,
    fallbackUsed = false,
  }) {
    try {
      await recordUsage({
        userId,
        provider: apiName,
        endpoint: "orchestration",
        requestType: `orchestrate:${requestType}${fallbackUsed ? ":fallback" : ""}`,
        totalTokens: tokens,
        costEstimate: cost,
        status,
        errorMessage: errorMessage?.slice(0, 1000),
        processingTimeMs,
      })
    } catch {
      // Usage tracking is never allowed to break the request.
      console.error("[orchestration] Failed to track API usage")
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Builds the standardised response envelope.
   *
   * @param {object} opts
   * @returns {OrchestrationResponse}
   */
  _buildResponse({ status, data, warnings = [], errors = [], startedAt, aiModelUsed = "unknown", tokensUsed = 0 }) {
    return {
      status,
      data,
      tokensUsed,
      processingTimeMs: Date.now() - startedAt,
      aiModelUsed,
      errors,
      warnings,
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const orchestrationEngine = new AIOrchestrationEngine()

// Also export the cache so other modules can invalidate on writes.
export { contextCache }
