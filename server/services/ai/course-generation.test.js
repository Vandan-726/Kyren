/**
 * Course Generation Engine Tests.
 *
 * Run with:
 *   node --env-file-if-exists=.env server/services/ai/course-generation.test.js
 */

import { generateCourseStructure } from "./agents/course-architecture.agent.js"
import { courseService } from "../course.service.js"
import { processCourseContentJob } from "../job-queue.service.js"
import { supabase } from "../../config/supabase.js"

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function testCourseArchitectureAgent() {
  console.log("▶ Testing Course Architecture Agent...")

  // We test the agent fallback/mock behavior without hitting network first
  const structure = await generateCourseStructure(
    { title: "Variables in Python", description: "Learn variables", difficulty: "beginner" },
    { profile: { preferred_language: "en" } }
  )

  assert(structure.title.includes("Variables in Python"), "Title is incorrect")
  assert(structure.modules.length >= 3, "Should generate at least 3 modules")
  assert(structure.modules[0].lessons.length >= 2, "Should generate at least 2 lessons per module")

  console.log("✔ Course Architecture Agent tests passed.")
}

async function testCourseServiceAndTransaction() {
  console.log("▶ Testing Course Service & DB Creation...")

  const mockUserId = "2eb687e4-f14f-4de2-9a3f-d02e59c0d3c8" // Valid user ID from seed data
  // Get a valid skill id
  const skillRes = await supabase.from("skills").select("id").limit(1)
  const mockSkillId = skillRes.data?.[0]?.id

  if (!mockSkillId) {
    console.warn("⚠ Skipping DB test: No skills found in database")
    return
  }

  const structure = {
    title: "Test Unit Course",
    description: "A course generated during automated tests.",
    difficulty: "beginner",
    estimatedHours: 5,
    modules: [
      {
        title: "Test Module 1",
        objective: "Learn basic definitions",
        estimatedHours: 2,
        lessons: [
          { title: "Test Lesson 1.1", description: "Intro to variables", objective: "Define var", keyConcepts: ["Variables"], estimatedMinutes: 45 },
          { title: "Test Lesson 1.2", description: "Intro to types", objective: "Define types", keyConcepts: ["Data Types"], estimatedMinutes: 45 }
        ]
      },
      {
        title: "Test Module 2",
        objective: "Apply definitions",
        estimatedHours: 3,
        lessons: [
          { title: "Test Lesson 2.1", description: "Operators basics", objective: "Operators", keyConcepts: ["Operators"], estimatedMinutes: 45 },
          { title: "Test Lesson 2.2", description: "Operations review", objective: "Review", keyConcepts: ["Arithmetic"], estimatedMinutes: 45 }
        ]
      },
      {
        title: "Test Module 3",
        objective: "Test Module 3 Objective",
        estimatedHours: 2,
        lessons: [
          { title: "Test Lesson 3.1", description: "Review lesson 1", objective: "Objective 1", keyConcepts: ["Review"], estimatedMinutes: 45 },
          { title: "Test Lesson 3.2", description: "Review lesson 2", objective: "Objective 2", keyConcepts: ["Summary"], estimatedMinutes: 45 }
        ]
      }
    ]
  }

  // Insert course via CourseService (which automatically enqueues content population job)
  const result = await courseService.createCourseFromStructure({
    structure,
    userId: mockUserId,
    skillId: mockSkillId,
    taskId: null
  })

  assert(result.courseId !== null, "Course was not created")
  assert(result.lessonIds.length === 6, "Expected 6 lessons to be created")

  // Check that records actually exist in Supabase
  const dbCourse = await supabase.from("courses").select("id, status").eq("id", result.courseId).single()
  assert(dbCourse.data.status === "draft", "Course status should start as draft")

  const dbModules = await supabase.from("course_modules").select("id").eq("course_id", result.courseId)
  assert(dbModules.data.length === 3, "Expected 3 modules in database")

  // Cleanup after test
  await supabase.from("courses").delete().eq("id", result.courseId)
  console.log("✔ Course Service & Transaction tests passed.")
}

async function testJobProcessorMock() {
  console.log("▶ Testing Job Queue Processor (Dry-Run)...")

  // Stub the processor dependencies to avoid network calls during quick test
  const mockUserId = "2eb687e4-f14f-4de2-9a3f-d02e59c0d3c8"
  const skillRes = await supabase.from("skills").select("id").limit(1)
  const mockSkillId = skillRes.data?.[0]?.id

  if (!mockSkillId) {
    console.warn("⚠ Skipping job processor test: No skills found")
    return
  }

  // Create a temporary course structure to run the processor against
  const structure = {
    title: "Test Queue Course",
    description: "Dry-run testing course",
    difficulty: "beginner",
    estimatedHours: 4,
    modules: [
      {
        title: "Dry Module",
        objective: "Dry objective",
        lessons: [
          { title: "Dry Lesson 1", description: "Description 1" },
          { title: "Dry Lesson 2", description: "Description 2" }
        ]
      },
      {
        title: "Dry Module 2",
        objective: "Dry objective 2",
        lessons: [
          { title: "Dry Lesson 3", description: "Description 3" },
          { title: "Dry Lesson 4", description: "Description 4" }
        ]
      },
      {
        title: "Dry Module 3",
        objective: "Dry objective 3",
        lessons: [
          { title: "Dry Lesson 5", description: "Description 5" },
          { title: "Dry Lesson 6", description: "Description 6" }
        ]
      }
    ]
  }

  const creation = await courseService.createCourseFromStructure({
    structure,
    userId: mockUserId,
    skillId: mockSkillId
  })

  // Run the processor synchronously as a dry-run
  const job = {
    payload: {
      courseId: creation.courseId,
      lessonIds: creation.lessonIds
    },
    user_id: mockUserId
  }

  const jobResult = await processCourseContentJob(job)
  assert(jobResult.status === "succeeded", "Job execution failed")

  // Verify course status is updated to generated
  const dbCourse = await supabase.from("courses").select("status").eq("id", creation.courseId).single()
  assert(dbCourse.data.status === "generated", "Course status should be published/generated after job succeeds")

  // Verify lesson content summary has markdown
  const dbLessons = await supabase.from("lessons").select("content_markdown").in("id", creation.lessonIds)
  assert(dbLessons.data.every(l => l.content_markdown !== null), "All lessons should have summaries populated")

  // Cleanup
  await supabase.from("courses").delete().eq("id", creation.courseId)
  console.log("✔ Job Queue Processor tests passed.")
}

async function run() {
  console.log("=== STARTING COURSE GENERATION ENGINE TESTS ===")
  const start = Date.now()

  try {
    await testCourseArchitectureAgent()
    await testCourseServiceAndTransaction()
    await testJobProcessorMock()

    console.log(`\n🎉 ALL TESTS PASSED SUCCESSFULLY! (took ${Date.now() - start}ms)`)
    process.exit(0)
  } catch (err) {
    console.error(`\n❌ TEST FAILURE:`, err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

run()
