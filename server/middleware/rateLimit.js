/**
 * Rate limiting tiers.
 *
 * Three tiers exist because the cost profiles are wildly different:
 *   - general: cheap CRUD, generous ceiling.
 *   - auth: brute-force surface, strict and keyed by email+IP so one attacker
 *     cannot lock out a whole NAT range.
 *   - ai: each request costs real money at xAI/Sarvam, so it is keyed per user
 *     rather than per IP.
 *
 * The store is in-memory, which means limits are per-instance. That is
 * acceptable as a first line of defence; the durable quota lives in
 * `ai_api_usage` and is enforced separately in the AI service layer.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit"
import { fail } from "../utils/respond.js"

const handler = (message) => (req, res) =>
  fail(res, 429, "rate_limited", message)

/** IPv6-safe client key. */
const byIp = (req, res) => ipKeyGenerator(req, res)

/** Prefer the authenticated user; fall back to IP for anonymous callers. */
const byUser = (req, res) => req.user?.id ?? ipKeyGenerator(req, res)

const base = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
}

export const generalLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: byUser,
  handler: handler("Too many requests. Please slow down."),
})

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim()
    return email ? `${ipKeyGenerator(req, res)}:${email}` : ipKeyGenerator(req, res)
  },
  handler: handler(
    "Too many authentication attempts. Please try again in 15 minutes.",
  ),
})

export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: byUser,
  handler: handler(
    "You are sending AI requests too quickly. Please wait a moment.",
  ),
})

/** Course/quiz generation is the most expensive operation in the product. */
export const generationLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: byUser,
  handler: handler(
    "Hourly generation limit reached. Existing courses remain available.",
  ),
})

export { byIp }
