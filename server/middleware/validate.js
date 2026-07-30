/**
 * Zod-backed request validation.
 *
 * Validated values are written to `req.valid.{body,query,params}` rather than
 * overwriting `req.body`/`req.query`, because in Express 5 `req.query` is a
 * getter and cannot be reassigned.
 */

import { z } from "zod"
import { badRequest } from "../utils/errors.js"

function flatten(zodError) {
  return zodError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))
}

/**
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid || {}

    for (const key of ["body", "query", "params"]) {
      const schema = schemas[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])
      if (!result.success) {
        return next(
          badRequest(`Invalid request ${key}`, flatten(result.error)),
        )
      }
      req.valid[key] = result.data
    }

    return next()
  }
}

/* ------------------------------------------------------------------ */
/* Reusable primitives                                                 */
/* ------------------------------------------------------------------ */

export const uuid = z.string().uuid("Must be a valid UUID")

export const idParam = z.object({ id: uuid })

/**
 * Standard list query: page/limit plus optional sort. Coerces the numeric
 * strings that arrive on the query string and clamps `limit` so a client
 * cannot request the entire table in one call.
 */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(100).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
})

export const SUPPORTED_LANGUAGES = [
  "en",
  "hi",
  "bn",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
  "or",
  "as",
]

export const languageEnum = z.enum(SUPPORTED_LANGUAGES)

export { z }
