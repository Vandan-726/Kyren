/**
 * AI Orchestration Engine Tests
 *
 * Run with:
 *   node --env-file-if-exists=.env server/services/ai/orchestration-engine.test.js
 */

import { contextCache, orchestrationEngine, AIOrchestrationEngine } from "./orchestration-engine.js"
import { ContextCache } from "./context-cache.js"
import {
  getTemplateCourseStructure,
  getTemplateQuiz,
  getTemplateLessonContent,
  getFallbackVideoLibrary,
} from "./fallback-templates.js"
import { supabase } from "../../config/supabase.js"
import { checkMonthlyBudget } from "../aiUsageService.js"

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// 1. Context Cache Tests
// ---------------------------------------------------------------------------
async function testContextCache() {
  console.log("▶ Testing Context Cache...")

  const cache = new ContextCache({ ttlMs: 50, maxEntries: 3 })

  // Basic set/get
  cache.set("key1", "val1")
  assert(cache.get("key1") === "val1", "Basic get/set failed")

  // Expiration
  await sleep(100)
  assert(cache.get("key1") === null, "TTL eviction failed")

  // LRU Eviction
  cache.set("a", 1)
  cache.set("b", 2)
  cache.set("c", 3)
  assert(cache.size === 3, "Size should be 3")
  cache.set("d", 4) // should evict 'a' (oldest)
  assert(cache.get("a") === null, "LRU oldest entry eviction failed")
  assert(cache.get("b") === 2, "LRU preserved entry failed")

  // Invalidation
  cache.invalidate("b")
  assert(cache.get("b") === null, "Invalidation failed")

  // Prefix Invalidation
  cache.set("user:1:profile", { name: "Alice" })
  cache.set("user:1:mastery", [90])
  cache.set("user:2:profile", { name: "Bob" })

  cache.invalidateByPrefix("user:1:")
  assert(cache.get("user:1:profile") === null, "Prefix invalidation user 1 failed")
  assert(cache.get("user:1:mastery") === null, "Prefix invalidation user 1 failed")
  assert(cache.get("user:2:profile") !== null, "Prefix invalidation affected other users")

  console.log("✔ Context Cache tests passed.")
}

// ---------------------------------------------------------------------------
// 2. Fallback Templates Tests
// ---------------------------------------------------------------------------
function testFallbackTemplates() {
  console.log("▶ Testing Fallback Templates...")

  const course = getTemplateCourseStructure("Variables in C", "beginner")
  assert(course.course.title.includes("Variables in C"), "Course template title mismatch")
  assert(course.course.difficulty === "beginner", "Course template difficulty mismatch")
  assert(course.modules.length === 3, "Course template modules length mismatch")
  assert(course.modules[0].lessons.length === 3, "Course template lessons length mismatch")

  const quiz = getTemplateQuiz("Arrays", "intermediate")
  assert(quiz.questions.length === 5, "Quiz template length mismatch")
  assert(quiz.questions[0].question_text.includes("Arrays"), "Quiz template question text mismatch")

  const content = getTemplateLessonContent("Loops")
  assert(content.ai_summary.includes("Loops"), "Lesson content summary mismatch")
  assert(content.key_concepts.length > 0, "Lesson content concepts empty")

  const videos = getFallbackVideoLibrary("Pointers")
  assert(videos.videos.length > 0, "Video library empty")
  assert(videos.videos[0].title.toLowerCase().includes("pointer"), "Video library topic mismatch")

  console.log("✔ Fallback Templates tests passed.")
}

// ---------------------------------------------------------------------------
// 3. Orchestration Engine Tests
// ---------------------------------------------------------------------------
async function testOrchestrationEngine() {
  console.log("▶ Testing Orchestration Engine...")

  // A. Routing check
  const list = AIOrchestrationEngine.listRequestTypes()
  assert(list.includes("gap_detection"), "Missing gap_detection in request types")
  assert(list.includes("course_generation"), "Missing course_generation in request types")

  for (const type of list) {
    const fn = orchestrationEngine.routeRequest(type)
    assert(typeof fn === "function", `No agent function registered for "${type}"`)
  }

  // B. Context loading & caching with mocked Supabase client
  const originalFrom = supabase.from
  const mockUserId = "test-user-uuid"

  let queryCounts = { profiles: 0, mastery: 0, gaps: 0, quizzes: 0, tasks: 0 }

  // Temporarily stub supabase.from
  supabase.from = (table) => {
    return {
      select: (fields) => {
        return {
          eq: (col, val) => {
            if (table === "student_profiles") {
              queryCounts.profiles++
              return { maybeSingle: async () => ({ data: { preferred_language: "hi" } }) }
            }
            if (table === "student_skill_mastery") {
              queryCounts.mastery++
              return { data: [] }
            }
            if (table === "learning_gaps") {
              queryCounts.gaps++
              return {
                in: (c, v) => ({ data: [] })
              }
            }
            if (table === "quiz_attempts") {
              queryCounts.quizzes++
              return {
                order: (c, o) => ({
                  limit: (l) => ({ data: [] })
                })
              }
            }
            if (table === "learning_tasks") {
              queryCounts.tasks++
              return {
                in: (c, v) => ({
                  order: (c2, o2) => ({
                    limit: (l) => ({ data: [] })
                  })
                })
              }
            }
            return { data: [] }
          }
        }
      }
    }
  }

  // Load context first time (should hit Supabase)
  contextCache.clear()
  const context1 = await orchestrationEngine.loadStudentContext(mockUserId)
  assert(context1.profile.preferred_language === "hi", "Failed to load mock profile")
  assert(queryCounts.profiles === 1, `Query count should be 1, got ${queryCounts.profiles}`)

  // Load context second time (should hit cache)
  const context2 = await orchestrationEngine.loadStudentContext(mockUserId)
  assert(context2.profile.preferred_language === "hi", "Failed to load cached profile")
  assert(queryCounts.profiles === 1, `Query count should still be 1 (cached), got ${queryCounts.profiles}`)

  // Invalidate cache
  orchestrationEngine.invalidateContext(mockUserId)
  const context3 = await orchestrationEngine.loadStudentContext(mockUserId)
  assert(queryCounts.profiles === 2, `Query count should be 2 after invalidation, got ${queryCounts.profiles}`)

  // Restore original supabase.from
  supabase.from = originalFrom

  // C. Test orchestration response with fallback
  // Mock routeRequest to return a failing function
  const originalRoute = orchestrationEngine.routeRequest
  orchestrationEngine.routeRequest = (type) => {
    if (type === "course_generation") {
      return async () => {
        throw new Error("Primary agent service unavailable")
      }
    }
    return originalRoute.call(orchestrationEngine, type)
  }

  // Force budget check to bypass real record usage (stub recordUsage to be empty)
  const originalTrack = orchestrationEngine.trackAPIUsage
  orchestrationEngine.trackAPIUsage = async () => {}

  const response = await orchestrationEngine.orchestrateRequest({
    requestType: "course_generation",
    params: { skillName: "Loops" },
    userId: mockUserId,
  })

  // Restore functions
  orchestrationEngine.routeRequest = originalRoute
  orchestrationEngine.trackAPIUsage = originalTrack

  // Validate envelope
  assert(response.status === "partial", `Expected status "partial" (fallback), got "${response.status}"`)
  assert(response.aiModelUsed === "fallback", `Expected fallback model, got "${response.aiModelUsed}"`)
  assert(response.data.course.title.includes("Loops"), "Expected course fallback title to contain 'Loops'")
  assert(response.errors.length > 0, "Expected errors to contain primary agent failure")
  assert(response.warnings.length > 0, "Expected warnings to contain fallback warnings")
  assert(typeof response.processingTimeMs === "number", "Expected processingTimeMs to be a number")

  console.log("✔ Orchestration Engine tests passed.")
}

// ---------------------------------------------------------------------------
// 4. Budget Tracking Tests
// ---------------------------------------------------------------------------
async function testBudgetTracking() {
  console.log("▶ Testing Budget Tracking...")

  const budget = await checkMonthlyBudget()
  assert(typeof budget.withinBudget === "boolean", "withinBudget is not a boolean")
  assert(typeof budget.currentSpend === "number", "currentSpend is not a number")
  assert(typeof budget.budgetLimit === "number", "budgetLimit is not a number")
  assert(typeof budget.percentUsed === "number", "percentUsed is not a number")

  console.log("✔ Budget Tracking tests passed.")
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
async function runAll() {
  console.log("=== STARTING ORCHESTRATION ENGINE TESTS ===")
  const start = Date.now()

  try {
    await testContextCache()
    testFallbackTemplates()
    await testOrchestrationEngine()
    await testBudgetTracking()

    console.log(`\n🎉 ALL TESTS PASSED SUCCESSFULLY! (took ${Date.now() - start}ms)`)
    process.exit(0)
  } catch (err) {
    console.error(`\n❌ TEST FAILURE:`, err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

runAll()
