/**
 * Express application factory.
 *
 * Exported as a bare app (not a listening server) so the same instance can be
 * used by `server/index.js` for local development and by `api/index.js` as a
 * Vercel serverless function.
 */

import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import compression from "compression"
import cookieParser from "cookie-parser"
import { requestContextMiddleware } from "./lib/requestContext.js"

import { env, assertProductionSecrets } from "./config/env.js"
import { generalLimiter } from "./middleware/rateLimit.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { optionalAuth } from "./middleware/auth.js"
import apiRouter from "./routes/index.js"

assertProductionSecrets()

export function createApp() {
  const app = express()

  // Vercel and most proxies terminate TLS upstream; without this the rate
  // limiter would see the proxy IP for every caller.
  app.set("trust proxy", 1)
  app.disable("x-powered-by")

  app.use(
    helmet({
      // Allow sign-in popups (like Google Auth via Firebase) to communicate back without COOP isolation
      crossOriginOpenerPolicy: { policy: "unsafe-none" },
      // The API serves JSON only, so a restrictive CSP here costs nothing.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: env.isProduction
        ? { maxAge: 63072000, includeSubDomains: true }
        : false,
    }),
  )

  app.use(
    cors({
      // An empty allowlist reflects the caller's origin, which is what we want
      // for same-origin Vercel deploys and the local Vite proxy.
      origin: env.cors.origins.length > 0 ? env.cors.origins : true,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-cron-secret"],
      maxAge: 86400,
    }),
  )

  app.use(compression())
  // 1 MB is generous for JSON while still bounding memory per request.
  app.use(express.json({ limit: "1mb" }))
  app.use(express.urlencoded({ extended: true, limit: "1mb" }))
  // Refresh tokens live in an HttpOnly cookie, so /api/auth needs req.cookies.
  app.use(cookieParser())

  if (!env.isProduction) {
    app.use(morgan("dev"))
  }

  // Resolve the caller before the limiter so AI/general quotas key on user id
  // rather than a shared NAT address. Never rejects on a bad token.
  app.use("/api", optionalAuth)
  // Binds req.user.id to the async context so nested AI calls self-attribute.
  // Must sit after optionalAuth and before the routers that trigger agents.
  app.use("/api", requestContextMiddleware)
  app.use("/api", generalLimiter)

  app.use("/api", apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export default createApp()
