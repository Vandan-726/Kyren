/**
 * Auth endpoints.
 *
 * Refresh tokens travel in an HttpOnly cookie, never in a JSON body the client
 * has to store. Access tokens are returned in JSON and held in memory by the
 * client. That split means XSS cannot read the long-lived credential and CSRF
 * cannot use it (SameSite=Lax + the refresh route requires no other state).
 */

import { Router } from "express"

import * as authService from "../services/authService.js"
import { requireAuth } from "../middleware/auth.js"
import { authLimiter } from "../middleware/rateLimit.js"
import { validate, z } from "../middleware/validate.js"
import { asyncHandler, unauthorized } from "../utils/errors.js"
import { ok, created } from "../utils/respond.js"
import { env } from "../config/env.js"
import { isFirebaseConfigured } from "../config/firebase.js"

const router = Router()

const REFRESH_COOKIE = "kyren_refresh"

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/api/auth",
    expires: expiresAt ? new Date(expiresAt) : undefined,
  })
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" })
}

/** Reads the refresh token from the cookie, falling back to the body. */
function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null
}

/** Splits a service result into the cookie half and the JSON half. */
function respondWithSession(res, result, status = 200) {
  const { refreshToken, refreshTokenExpiresAt, ...body } = result
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt)
  return status === 201 ? created(res, body) : ok(res, body)
}

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.headers["user-agent"],
})

/* ------------------------------------------------------------------ */

const emailSchema = z.string().trim().toLowerCase().email("A valid email address is required")

router.post(
  "/register",
  authLimiter,
  validate({
    body: z.object({
      email: emailSchema,
      password: z.string().min(8, "Password must be at least 8 characters").max(200),
      fullName: z.string().trim().min(1).max(150).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.registerWithPassword(req.valid.body, requestContext(req))
    return respondWithSession(res, result, 201)
  }),
)

router.post(
  "/login",
  authLimiter,
  validate({
    body: z.object({
      email: emailSchema,
      password: z.string().min(1, "Password is required").max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.loginWithPassword(req.valid.body, requestContext(req))
    return respondWithSession(res, result)
  }),
)

router.post(
  "/google",
  authLimiter,
  validate({
    body: z.object({
      idToken: z.string().min(1, "A Firebase ID token is required"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.loginWithGoogle(req.valid.body, requestContext(req))
    return respondWithSession(res, result)
  }),
)

router.post(
  "/forgot-password",
  authLimiter,
  validate({
    body: z.object({
      email: emailSchema,
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.valid.body)
    return ok(res, result)
  }),
)

router.post(
  "/reset-password",
  authLimiter,
  validate({
    body: z.object({
      token: z.string().min(1, "Reset token is required"),
      newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.valid.body)
    return ok(res, result)
  }),
)

/** Reports which auth methods this deployment can actually serve. */
router.get(
  "/providers",
  asyncHandler(async (_req, res) =>
    ok(res, {
      password: true,
      google: isFirebaseConfigured(),
    }),
  ),
)

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req)
    if (!refreshToken) throw unauthorized("No refresh token was provided")

    try {
      const result = await authService.refresh({ refreshToken }, requestContext(req))
      return respondWithSession(res, result)
    } catch (error) {
      // A dead session should not leave a stale cookie behind to retry with.
      clearRefreshCookie(res)
      throw error
    }
  }),
)

router.post(
  "/logout",
  validate({ body: z.object({ allDevices: z.boolean().default(false) }).partial() }),
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req)
    await authService.logout({
      refreshToken,
      allDevices: Boolean(req.body?.allDevices),
      userId: req.user?.id ?? null,
    })
    clearRefreshCookie(res)
    return ok(res, { success: true })
  }),
)

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => ok(res, { user: await authService.getUserById(req.user.id) })),
)

router.post(
  "/change-password",
  requireAuth,
  authLimiter,
  validate({
    body: z.object({
      currentPassword: z.string().max(200).optional(),
      newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    await authService.changePassword({ userId: req.user.id, ...req.valid.body })
    // Every session including this one was revoked, so drop the cookie too.
    clearRefreshCookie(res)
    return ok(res, { success: true, message: "Password updated. Please sign in again." })
  }),
)

export default router
