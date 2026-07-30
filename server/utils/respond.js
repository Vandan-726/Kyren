/**
 * Uniform response envelope.
 *
 * Every endpoint returns either
 *   { success: true,  data: <payload>, meta?: {...} }
 * or
 *   { success: false, error: { code, message, details? } }
 *
 * The frontend API client relies on this shape to unwrap responses, so no
 * handler should ever `res.json()` a bare payload.
 */

export function ok(res, data, meta) {
  const body = { success: true, data }
  if (meta) body.meta = meta
  return res.json(body)
}

export function created(res, data, meta) {
  const body = { success: true, data }
  if (meta) body.meta = meta
  return res.status(201).json(body)
}

export function noContent(res) {
  return res.status(204).end()
}

/**
 * Paginated list response. `meta` carries enough information for the client to
 * render "showing X–Y of Z" without a second request.
 */
export function paginated(res, items, { page, limit, total }) {
  return res.json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasMore: page * limit < total,
    },
  })
}

export function fail(res, status, code, message, details) {
  const error = { code, message }
  if (details !== undefined) error.details = details
  return res.status(status).json({ success: false, error })
}
