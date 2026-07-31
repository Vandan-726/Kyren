import { Router } from "express"
import { supabase, unwrap } from "../config/supabase.js"
import { enqueueJob } from "../services/jobQueue.js"
import { requireAuth } from "../middleware/auth.js"
import { ok } from "../utils/respond.js"
import {
  getTableName,
  normalizeEntityName,
  mapFilterKey,
  mapOrderField,
  mapEntityDataToBackend,
  mapEntityDataToFrontend,
} from "./entityMappings.js"

const router = Router()

// Helper to parse estimated_time (e.g., "30 min") into hours numeric
const parseEstimatedTimeToHours = (timeStr) => {
  if (!timeStr) return 0.5
  const mins = parseInt(timeStr, 10)
  return isNaN(mins) ? 0.5 : mins / 60
}

const isUuid = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)

async function resolveSkillReference(skillIdentifier) {
  if (!skillIdentifier || isUuid(skillIdentifier)) return skillIdentifier

  const skillCode = String(skillIdentifier).trim()
  if (!skillCode) return skillIdentifier

  const resolved = await supabase
    .from("skills")
    .select("id")
    .or(`skill_code.eq.${skillCode},skill_name.ilike.%${skillCode}%`)
    .limit(1)
    .maybeSingle()

  if (resolved.error || !resolved.data) {
    return skillIdentifier
  }

  return resolved.data.id
}

async function normalizeLearningGapSkillId(body) {
  if (!body || !body.skill_id || isUuid(body.skill_id)) {
    return body
  }

  const skillId = await resolveSkillReference(body.skill_id)
  return {
    ...body,
    skill_id: skillId,
  }
}

async function normalizeLearningTaskSkillId(body) {
  if (!body) {
    return body
  }

  const skillIdentifier = body.skill_id || body.skill_name
  if (!skillIdentifier || isUuid(skillIdentifier)) {
    return body
  }

  const skillId = await resolveSkillReference(skillIdentifier)
  if (!skillId) {
    return {
      ...body,
      skill_id: null,
    }
  }

  return {
    ...body,
    skill_id: skillId,
  }
}

// Helper to format hours numeric back into estimated_time (e.g., "30 min")
const formatHoursToEstimatedTime = (hours) => {
  if (hours == null) return "30 min"
  return Math.round(hours * 60) + " min"
}

// Bidirectional mappers for alignment between frontend fields and backend columns
const MAPPERS = {
  "MasteryScore": {
    toBackend: (data) => {
      const res = { ...data }
      if (data.percentage !== undefined) {
        res.mastery_percentage = data.percentage
        delete res.percentage
      }
      if (data.status !== undefined) {
        res.mastery_level = data.status === "Mastered" ? "mastered" : "learning"
        delete res.status
      }
      return res
    },
    toFrontend: (data) => {
      if (!data) return data
      const res = { ...data }
      if (data.mastery_percentage !== undefined) {
        res.percentage = Number(data.mastery_percentage)
      }
      if (data.mastery_level !== undefined) {
        res.status = data.mastery_level === "mastered" ? "Mastered" : "InProgress"
      }
      return res
    }
  },
  "LearningGap": {
    toBackend: (data) => {
      const res = { ...data }
      if (data.skill_name !== undefined) {
        res.gap_title = data.skill_name
        delete res.skill_name
      }
      if (data.resolved !== undefined) {
        res.status = data.resolved ? "resolved" : "detected"
        res.resolved_at = data.resolved ? new Date().toISOString() : null
        delete res.resolved
      }
      return res
    },
    toFrontend: (data) => {
      if (!data) return data
      const res = { ...data }
      if (data.gap_title !== undefined) {
        res.skill_name = data.gap_title
      }
      if (data.status !== undefined) {
        res.resolved = data.status === "resolved"
      }
      return res
    }
  },
  "LearningTask": {
    toBackend: (data) => {
      const res = { ...data }
      if (data.title !== undefined) {
        res.task_title = data.title
        delete res.title
      }
      if (data.description !== undefined) {
        res.task_description = data.description
        delete res.description
      }
      if (data.reason !== undefined) {
        res.creation_reason = data.reason
        delete res.reason
      }
      if (data.priority !== undefined) {
        res.priority_level = parseInt(data.priority, 10)
        delete res.priority
      }
      if (data.estimated_time !== undefined) {
        res.estimated_duration_hours = parseEstimatedTimeToHours(data.estimated_time)
        delete res.estimated_time
      }
      if (data.status !== undefined) {
        const statusMap = {
          "Detected": "detected",
          "Suggested": "suggested",
          "Approved": "approved",
          "In Progress": "in_progress",
          "Completed": "completed",
          "Mastered": "mastered"
        }
        res.status = statusMap[data.status] || data.status.toLowerCase()
      }
      return res
    },
    toFrontend: (data) => {
      if (!data) return data
      const res = { ...data }
      if (data.task_title !== undefined) {
        res.title = data.task_title
      }
      if (data.task_description !== undefined) {
        res.description = data.task_description
      }
      if (data.creation_reason !== undefined) {
        res.reason = data.creation_reason
      }
      if (data.priority_level !== undefined) {
        res.priority = data.priority_level
      }
      if (data.estimated_duration_hours !== undefined) {
        res.estimated_time = formatHoursToEstimatedTime(data.estimated_duration_hours)
      }
      if (data.status !== undefined) {
        const statusMap = {
          "detected": "Detected",
          "suggested": "Suggested",
          "approved": "Approved",
          "in_progress": "In Progress",
          "completed": "Completed",
          "mastered": "Mastered"
        }
        res.status = statusMap[data.status] || data.status
      }
      return res
    }
  },
  "Notification": {
    toBackend: (data) => {
      const res = { ...data }
      if (data.type !== undefined) {
        res.notification_type = data.type
        delete res.type
      }
      if (data.message !== undefined) {
        res.body = data.message
        delete res.message
      }
      if (data.payload !== undefined) {
        res.metadata = data.payload
        delete res.payload
      }
      return res
    },
    toFrontend: (data) => {
      if (!data) return data
      const res = { ...data }
      if (data.notification_type !== undefined) {
        res.type = data.notification_type
      }
      if (data.body !== undefined) {
        res.message = data.body
      }
      if (data.metadata !== undefined) {
        res.payload = data.metadata
      }
      return res
    }
  },
  "Recommendation": {
    toBackend: (data) => {
      const res = { ...data }
      if (data.reason !== undefined) {
        res.recommendation_reason = data.reason
        delete res.reason
      }
      if (data.type !== undefined) {
        res.recommendation_type = data.type
        delete res.type
      }
      return res
    },
    toFrontend: (data) => {
      if (!data) return data
      const res = { ...data }
      if (data.recommendation_reason !== undefined) {
        res.reason = data.recommendation_reason
      }
      if (data.recommendation_type !== undefined) {
        res.type = data.recommendation_type
      }
      res.recommended_title = data.recommended_title || "Recommended Skill"
      return res
    }
  }
}

const handleRequest = async (req, res, next) => {
  try {
    const rawEntityName = req.params.namespace
      ? `${req.params.namespace}/${req.params.entityName}`
      : req.params.entityName
    const entityName = normalizeEntityName(rawEntityName)
    const tableName = getTableName(entityName)
    const id = req.params.id

    // Check if this is a known table or if we should skip it
    if (tableName === "health" || tableName === "auth" || tableName === "voice" || tableName === "learning" || tableName === "progress" || tableName === "skills" || tableName === "agents") {
      return next()
    }

    let query = supabase.from(tableName)

    // 1. READ (GET)
    if (req.method === "GET") {
      if (id) {
        const result = await query.select("*").eq("id", id).maybeSingle()
        if (result.error) {
          // Table may not exist yet — return null gracefully
          return ok(res, null)
        }
        let data = result.data
        data = mapEntityDataToFrontend(entityName, data)
        if (data && MAPPERS[entityName]) {
          data = MAPPERS[entityName].toFrontend(data)
        }
        return ok(res, data)
      } else {
        let selectQuery = query.select("*")

        // Automatically enforce user-level sandbox for security (unless it's public metadata)
        if (tableName !== "courses" && tableName !== "lessons" && tableName !== "skills" && tableName !== "conversation_messages") {
          selectQuery = selectQuery.eq("user_id", req.user.id)
        }

        // Apply filters passed as query params
        const isAutoSandboxed = tableName !== "courses" && tableName !== "lessons" && tableName !== "skills" && tableName !== "conversation_messages"
        Object.entries(req.query).forEach(([key, val]) => {
          // Skip user_id from query params if already auto-sandboxed to prevent
          // conflicting filters (frontend user.id may differ from req.user.id)
          if (key === "user_id" && isAutoSandboxed) return
          if (key !== "orderBy" && key !== "page" && key !== "limit") {
            let mappedKey = mapFilterKey(entityName, key)
            let mappedVal = val

            // Parse booleans
            if (mappedVal === "true") mappedVal = true
            if (mappedVal === "false") mappedVal = false

            // Parse integers if pure numeric
            if (typeof mappedVal === "string" && /^\d+$/.test(mappedVal)) {
              mappedVal = parseInt(mappedVal, 10)
            }

            if (entityName === "LearningGap") {
              if (key === "resolved") {
                if (mappedVal === false) {
                  selectQuery = selectQuery.neq("status", "resolved")
                  return
                } else {
                  mappedKey = "status"
                  mappedVal = "resolved"
                }
              }
            } else if (entityName === "MasteryScore") {
              if (key === "status") {
                mappedVal = val === "Mastered" ? "mastered" : "learning"
              }
            } else if (entityName === "LearningTask") {
              if (key === "status") {
                const statusMap = {
                  "Detected": "detected",
                  "Suggested": "suggested",
                  "Approved": "approved",
                  "In Progress": "in_progress",
                  "Completed": "completed",
                  "Mastered": "mastered"
                }
                mappedVal = statusMap[val] || val.toLowerCase()
              }
            }

            selectQuery = selectQuery.eq(mappedKey, mappedVal)
          }
        })

        // Apply ordering
        if (req.query.orderBy) {
          const isDesc = req.query.orderBy.startsWith("-")
          let field = isDesc ? req.query.orderBy.slice(1) : req.query.orderBy

          field = mapOrderField(entityName, field)

          selectQuery = selectQuery.order(field, { ascending: !isDesc })
        }

        console.log("GET Request:", tableName, "Query params:", req.query, "User:", req.user.id);
        const result = await selectQuery
        if (result.error) {
          console.error("GET Error for", tableName, result.error);
          return ok(res, [])
        }
        let list = result.data || []
        list = list.map(item => mapEntityDataToFrontend(entityName, item))
        if (MAPPERS[entityName]) {
          list = list.map(item => MAPPERS[entityName].toFrontend(item))
        }
        return ok(res, list)
      }
    }

    // 2. CREATE (POST)
    if (req.method === "POST") {
      let body = { ...req.body }
      if (tableName !== "courses" && tableName !== "lessons" && tableName !== "skills" && entityName !== "Message") {
        body.user_id = req.user.id
      }
      if (entityName === "Message") {
        delete body.user_id
        delete body.linked_gap_ids
      }
      if (entityName === "LearningGap") {
        body = await normalizeLearningGapSkillId(body)
      }
      if (entityName === "LearningTask") {
        delete body.skill_name
        body = await normalizeLearningTaskSkillId(body)
      }
      body = mapEntityDataToBackend(entityName, body)
      if (MAPPERS[entityName]) {
        body = MAPPERS[entityName].toBackend(body)
      }
      const row = unwrap(
        await query.insert(body).select("*").single(),
        `Creating ${tableName}`
      )
      let data = row
      data = mapEntityDataToFrontend(entityName, data)
      if (MAPPERS[entityName]) {
        data = MAPPERS[entityName].toFrontend(data)
      }
      return ok(res, data)
    }

    // 3. UPDATE (PATCH/PUT)
    if (req.method === "PATCH" || req.method === "PUT") {
      const updateId = id || req.body.id
      if (!updateId) {
        throw new Error("An ID is required to perform an update operation")
      }
      let body = { ...req.body }
      delete body.id
      if (entityName === "LearningGap") {
        body = await normalizeLearningGapSkillId(body)
      }
      if (entityName === "LearningTask") {
        body = await normalizeLearningTaskSkillId(body)
        delete body.skill_name
      }
      body = mapEntityDataToBackend(entityName, body)
      if (MAPPERS[entityName]) {
        body = MAPPERS[entityName].toBackend(body)
      }

      let updateQuery = query.update(body).eq("id", updateId)
      if (tableName !== "courses" && tableName !== "lessons" && tableName !== "skills") {
        updateQuery = updateQuery.eq("user_id", req.user.id)
      }

      const row = unwrap(
        await updateQuery.select("*").single(),
        `Updating ${tableName}`
      )

      // Trigger course generation when a learning task status is approved
      if (entityName === "LearningTask" && row.status === "approved") {
        console.log(`[Task Trigger] Learning task ${row.id} approved. Enqueuing course.generate job...`)
        try {
          await enqueueJob({
            type: "course.generate",
            userId: req.user.id,
            payload: {
              skillId: row.skill_id,
              taskId: row.id,
            },
          })
        } catch (jobError) {
          console.error("[Task Trigger] Failed to enqueue course.generate:", jobError.message)
        }
      }

      let data = row
      data = mapEntityDataToFrontend(entityName, data)
      if (MAPPERS[entityName]) {
        data = MAPPERS[entityName].toFrontend(data)
      }
      return ok(res, data)
    }

    // 4. DELETE (DELETE)
    if (req.method === "DELETE") {
      const deleteId = id || req.query.id
      if (!deleteId) {
        throw new Error("An ID is required to perform a delete operation")
      }

      let deleteQuery = query.delete().eq("id", deleteId)
      if (tableName !== "courses" && tableName !== "lessons" && tableName !== "skills") {
        deleteQuery = deleteQuery.eq("user_id", req.user.id)
      }

      unwrap(
        await deleteQuery,
        `Deleting ${tableName}`
      )
      return ok(res, { success: true })
    }

    next()
  } catch (err) {
    next(err)
  }
}

router.all("/:namespace/:entityName", requireAuth, handleRequest)
router.all("/:namespace/:entityName/:id", requireAuth, handleRequest)
router.all("/:entityName", requireAuth, handleRequest)
router.all("/:entityName/:id", requireAuth, handleRequest)

export default router
