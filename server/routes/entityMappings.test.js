import test from "node:test"
import assert from "node:assert/strict"
import {
  getTableName,
  mapFilterKey,
  mapOrderField,
  mapEntityDataToBackend,
  mapEntityDataToFrontend,
} from "./entityMappings.js"

test("maps conversation payloads to the ai_conversations schema", () => {
  const input = {
    user_id: "user-1",
    context_type: "companion",
    context_ref_id: "lesson-123",
    title: "Learning Companion",
    detected_language: "en",
  }

  const backend = mapEntityDataToBackend("Conversation", input)

  assert.equal(getTableName("Conversation"), "ai_conversations")
  assert.equal(backend.conversation_type, "companion")
  assert.equal(backend.subject_area, "lesson-123")
  assert.equal(backend.title, "Learning Companion")
  assert.equal(backend.language, undefined)
  assert.equal(backend.user_id, "user-1")
  assert.equal(backend.context_type, undefined)
  assert.equal(backend.context_ref_id, undefined)
  assert.equal(backend.detected_language, undefined)
})

test("maps message payloads to the conversation_messages schema", () => {
  const input = {
    user_id: "user-1",
    conversation_id: "conv-1",
    role: "student",
    content: "Hello",
    detected_language: "hi",
  }

  const backend = mapEntityDataToBackend("Message", input)

  assert.equal(getTableName("Message"), "conversation_messages")
  assert.equal(backend.message_type, "user")
  assert.equal(backend.content, "Hello")
  assert.equal(backend.language, "hi")
  assert.equal(backend.user_id, "user-1")
  assert.equal(backend.role, undefined)
  assert.equal(backend.detected_language, undefined)
})

test("translates filters and ordering for conversation entities", () => {
  assert.equal(mapFilterKey("Conversation", "context_type"), "conversation_type")
  assert.equal(mapFilterKey("Conversation", "context_ref_id"), "subject_area")
  assert.equal(mapOrderField("Conversation", "created_date"), "created_at")
})

test("drops unsupported skill_name when mapping LearningTask payloads to backend", () => {
  const backend = mapEntityDataToBackend("LearningTask", {
    title: "Study calculus",
    skill_name: "Calculus Basics",
    priority: 1,
  })

  assert.equal(backend.skill_name, undefined)
  assert.equal(backend.task_title, "Study calculus")
  assert.equal(backend.priority_level, 1)
})

test("normalizes nested LearningGap entity path for table lookup", () => {
  assert.equal(getTableName("learning/gaps"), "learning_gaps")
})

test("normalizes nested MasteryScore entity path for table lookup", () => {
  assert.equal(getTableName("progress/mastery"), "student_skill_mastery")
})

test("translates backend rows back to the frontend shape", () => {
  const frontend = mapEntityDataToFrontend("Conversation", {
    conversation_type: "tutor",
    subject_area: "lesson-123",
    language: "en",
  })

  assert.equal(frontend.context_type, "tutor")
  assert.equal(frontend.context_ref_id, "lesson-123")
  assert.equal(frontend.detected_language, "en")
})
