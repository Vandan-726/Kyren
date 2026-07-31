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

function formatHoursToEstimatedTime(hours) {
  if (hours == null) return "30 min"
  return Math.round(hours * 60) + " min"
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

  if (entityName === "TaskActivityLog" || entityName === "QuizAttempt") {
    if (key === "created_at") return "created_date"
    if (key === "created_date") return "created_date"
  } else if (key === "created_date") {
    return "created_at"
  }

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
  if (entityName === "QuizAttempt") {
    if (key === "lesson_id" || key === "skill_id" || key === "answers") return null
  }
  if (entityName === "Lesson") {
    if (key === "skill_id" || key === "skill_name" || key === "course_id") return null
  }
  if (entityName === "Quiz") {
    if (key === "module_id" || key === "difficulty") return null
  }

  return key
}

function mapOrderField(entityName, field) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  if (entityName === "TaskActivityLog" || entityName === "QuizAttempt") {
    if (field === "created_at") return "created_date"
    if (field === "created_date") return "created_date"
  } else if (field === "created_date") {
    return "created_at"
  }
  if (entityName === "LearningTask" && field === "priority") return "priority_level"
  if (entityName === "Module" && field === "order_index") return "module_number"
  if (entityName === "Lesson" && field === "order_index") return "lesson_number"
  return field
}

function mapEntityDataToBackend(entityName, data) {
  const canonicalName = normalizeEntityName(entityName)
  entityName = canonicalName
  const result = { ...data }

  if (entityName === "Course") {
    if (result.difficulty !== undefined) {
      result.difficulty_level = result.difficulty
      delete result.difficulty
    }
    if (result.estimated_duration !== undefined) {
      result.estimated_duration_hours = parseEstimatedTimeToHours(result.estimated_duration)
      delete result.estimated_duration
    }
    if (result.generated_from_task_id !== undefined) {
      result.task_id = result.generated_from_task_id
      delete result.generated_from_task_id
    }
    delete result.learning_objectives
    delete result.language
    delete result.progress
    return result
  }

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
    if (result.course_id !== undefined) {
      delete result.course_id
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

  if (entityName === "Module") {
    if (result.order_index !== undefined) {
      result.module_number = result.order_index
      delete result.order_index
    }
    return result
  }

  if (entityName === "Lesson") {
    if (result.order_index !== undefined) {
      result.lesson_number = result.order_index
      delete result.order_index
    }
    if (result.ai_summary !== undefined) {
      if (!result.content_markdown) {
        result.content_markdown = result.ai_summary
      }
      delete result.ai_summary
    }
    delete result.course_id
    delete result.completed
    delete result.skill_id
    delete result.skill_name
    return result
  }

  if (entityName === "Quiz") {
    delete result.module_id
    delete result.difficulty
    return result
  }

  if (entityName === "QuizQuestion") {
    if (result.difficulty !== undefined) {
      result.difficulty_level = result.difficulty
      delete result.difficulty
    }
    return result
  }

  if (entityName === "QuizAttempt") {
    delete result.lesson_id
    delete result.skill_id
    delete result.answers
    if (result.total_questions !== undefined && result.score !== undefined) {
      if (result.correct_answers === undefined) {
        result.correct_answers = Math.round((result.score / 100) * result.total_questions)
      }
      if (result.accuracy_percentage === undefined) {
        result.accuracy_percentage = result.score
      }
    }
    return result
  }

  if (entityName === "MasteryScore") {
    if (result.percentage !== undefined) {
      result.mastery_percentage = result.percentage
      delete result.percentage
    }
    if (result.status !== undefined) {
      result.mastery_level = result.status === "Mastered" ? "mastered" : "learning"
      delete result.status
    }
    delete result.last_updated
    delete result.next_review_date
    delete result.ease_factor
    delete result.interval_days
    delete result.repetitions
    delete result.skill_name
    return result
  }

  if (entityName === "Note") {
    if (result.pinned !== undefined) {
      result.is_pinned = result.pinned
      delete result.pinned
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

  if (entityName === "Course") {
    if (result.difficulty_level !== undefined) {
      result.difficulty = result.difficulty_level
    }
    if (result.estimated_duration_hours !== undefined) {
      result.estimated_duration = formatHoursToEstimatedTime(result.estimated_duration_hours)
    }
    if (result.task_id !== undefined) {
      result.generated_from_task_id = result.task_id
    }
  }

  if (entityName === "Module") {
    if (result.module_number !== undefined) {
      result.order_index = result.module_number
    }
  }

  if (entityName === "Lesson") {
    if (result.lesson_number !== undefined) {
      result.order_index = result.lesson_number
    }
    if (result.content_markdown !== undefined) {
      result.ai_summary = result.content_markdown
    }
    if (result.completed === undefined) {
      result.completed = false
    }
  }

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

  if (entityName === "QuizQuestion") {
    if (result.difficulty_level !== undefined) {
      result.difficulty = result.difficulty_level
    }
  }

  if (entityName === "Note") {
    if (result.is_pinned !== undefined) {
      result.pinned = result.is_pinned
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
