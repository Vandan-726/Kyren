const TABLE_MAPPING = {
  MasteryScore: "student_skill_mastery",
  LearningTask: "learning_tasks",
  TaskActivityLog: "task_activity_logs",
  Recommendation: "learning_recommendations",
  LearningGap: "learning_gaps",
  "learning/gaps": "learning_gaps",
  Course: "courses",
  Lesson: "lessons",
  StudentProgress: "student_progress",
  QuizAttempt: "quiz_attempts",
  Notification: "notifications",
  Conversation: "ai_conversations",
  Message: "conversation_messages",
  Classroom: "classrooms",
  Flashcard: "flashcards",
  SpacedReview: "spaced_reviews",
  Note: "student_notes",
  MicroModule: "micro_modules",
  Module: "course_modules",
  Quiz: "lesson_quizzes",
  QuizQuestion: "quiz_questions",
  courses: "courses",
  lessons: "lessons",
  users: "users",
  "progress/mastery": "student_skill_mastery",
}

function parseEstimatedTimeToHours(timeValue) {
  if (timeValue == null || timeValue === "") return 0.5
  if (typeof timeValue === "number" && Number.isFinite(timeValue)) {
    return timeValue <= 24 ? timeValue : timeValue / 60
  }

  const normalized = String(timeValue).trim().toLowerCase()
  const minuteMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes)?$/)
  if (minuteMatch) {
    return Number(minuteMatch[1]) / 60
  }

  const hourMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)$/)
  if (hourMatch) {
    return Number(hourMatch[1])
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? (parsed > 24 ? parsed / 60 : parsed) : 0.5
}

function normalizeEntityName(entityName) {
  if (!entityName) return entityName
  if (entityName === "learning/gaps") return "LearningGap"
  if (entityName === "progress/mastery") return "MasteryScore"
  return entityName
}

function getTableName(entityName) {
  const canonicalName = normalizeEntityName(entityName)
  return TABLE_MAPPING[canonicalName] || canonicalName
}

function mapFilterKey(entityName, key) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  if (entityName === "Conversation") {
    if (key === "context_type") return "conversation_type"
    if (key === "context_ref_id") return "subject_area"
    if (key === "detected_language") return "language"
  }

  if (entityName === "Message") {
    if (key === "role") return "message_type"
    if (key === "detected_language") return "language"
  }

  if (key === "created_date") return "created_at"
  if (entityName === "LearningGap") {
    if (key === "resolved") return "status"
    if (key === "skill_name") return "gap_title"
  }
  if (entityName === "MasteryScore") {
    if (key === "percentage") return "mastery_percentage"
    if (key === "status") return "mastery_level"
  }
  if (entityName === "LearningTask") {
    if (key === "title") return "task_title"
    if (key === "description") return "task_description"
    if (key === "reason") return "creation_reason"
    if (key === "priority") return "priority_level"
  }
  if (entityName === "Notification") {
    if (key === "type") return "notification_type"
    if (key === "message") return "body"
  }
  if (entityName === "Recommendation") {
    if (key === "type") return "recommendation_type"
  }

  return key
}

function mapOrderField(entityName, field) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  if (field === "created_date") return "created_at"
  if (entityName === "LearningTask" && field === "priority") return "priority_level"
  return field
}

function mapEntityDataToBackend(entityName, data) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  const result = { ...data }

  if (entityName === "Conversation") {
    if (result.context_type !== undefined) {
      result.conversation_type = result.context_type
      delete result.context_type
    }
    if (result.context_ref_id !== undefined) {
      result.subject_area = result.context_ref_id
      delete result.context_ref_id
    }
    if (result.detected_language !== undefined) {
      // ai_conversations does not store language, so drop this field here.
      delete result.detected_language
    }
  }

  if (entityName === "Message") {
    if (result.role !== undefined) {
      result.message_type = result.role === "ai" ? "assistant" : "user"
      delete result.role
    }
    if (result.detected_language !== undefined) {
      result.language = result.detected_language
      delete result.detected_language
    }
  }

  if (entityName === "LearningTask") {
    if (result.skill_name !== undefined) {
      delete result.skill_name
    }
    if (result.title !== undefined) {
      result.task_title = result.title
      delete result.title
    }
    if (result.description !== undefined) {
      result.task_description = result.description
      delete result.description
    }
    if (result.reason !== undefined) {
      result.creation_reason = result.reason
      delete result.reason
    }
    if (result.priority !== undefined) {
      result.priority_level = parseInt(result.priority, 10)
      delete result.priority
    }
    if (result.estimated_time !== undefined) {
      result.estimated_duration_hours = parseEstimatedTimeToHours(result.estimated_time)
      delete result.estimated_time
    }
    if (result.status !== undefined) {
      const statusMap = {
        "Detected": "detected",
        "Suggested": "suggested",
        "Approved": "approved",
        "In Progress": "in_progress",
        "Completed": "completed",
        "Mastered": "mastered"
      }
      result.status = statusMap[result.status] || result.status.toLowerCase()
    }
    return result
  }

  return result
}

function mapEntityDataToFrontend(entityName, data) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  if (!data) return data
  const result = { ...data }

  if (entityName === "Conversation") {
    if (result.conversation_type !== undefined) {
      result.context_type = result.conversation_type
    }
    if (result.subject_area !== undefined) {
      result.context_ref_id = result.subject_area
    }
    if (result.language !== undefined) {
      result.detected_language = result.language
    }
  }

  if (entityName === "Message") {
    if (result.message_type !== undefined) {
      result.role = result.message_type === "assistant" ? "ai" : "student"
    }
    if (result.language !== undefined) {
      result.detected_language = result.language
    }
  }

  return result
}

export {
  TABLE_MAPPING,
  getTableName,
  mapFilterKey,
  mapOrderField,
  mapEntityDataToBackend,
  mapEntityDataToFrontend,
  normalizeEntityName,
}
