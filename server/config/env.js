/**
 * Central environment configuration.
 *
 * Every process.env read in the backend goes through this module so that
 * missing configuration surfaces as one clear error at boot instead of an
 * `undefined` sneaking into an API call.
 */

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]

function read(key, fallback = undefined) {
  const value = process.env[key]
  if (value === undefined || value === "") return fallback
  return value
}

function readInt(key, fallback) {
  const raw = read(key)
  if (raw === undefined) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function readBool(key, fallback = false) {
  const raw = read(key)
  if (raw === undefined) return fallback
  return raw === "true" || raw === "1"
}

/**
 * Firebase service-account private keys are stored with literal `\n`
 * sequences in most dashboards. Convert them back to real newlines.
 */
function normalizePrivateKey(key) {
  if (!key) return undefined
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key
}

export const env = {
  nodeEnv: read("NODE_ENV", "development"),
  isProduction: read("NODE_ENV") === "production",
  port: readInt("PORT", 3001),

  supabase: {
    url: read("SUPABASE_URL") ?? read("SUPABASE_NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey:
      read("SUPABASE_ANON_KEY") ??
      read("SUPABASE_NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  },

  jwt: {
    // Dev-only fallbacks keep the server bootable before secrets are set.
    // `assertProductionSecrets()` refuses to let these reach production.
    accessSecret: read("JWT_SECRET", "kyren-dev-access-secret-change-me"),
    refreshSecret: read(
      "JWT_REFRESH_SECRET",
      "kyren-dev-refresh-secret-change-me",
    ),
    accessTtl: read("JWT_ACCESS_TTL", "15m"),
    refreshTtlDays: readInt("JWT_REFRESH_TTL_DAYS", 30),
    issuer: "kyren",
  },

  xai: {
    apiKey: read("XAI_API_KEY"),
    baseUrl: read("XAI_BASE_URL", "https://api.x.ai/v1"),
    model: read("XAI_MODEL", "grok-3"),
    fastModel: read("XAI_FAST_MODEL", "grok-3-mini"),
    timeoutMs: readInt("XAI_TIMEOUT_MS", 120000),
  },

  sarvam: {
    apiKey: read("SARVAM_API_KEY"),
    baseUrl: read("SARVAM_BASE_URL", "https://api.sarvam.ai"),
  },

  youtube: {
    apiKey: read("YOUTUBE_API_KEY"),
  },

  firebase: {
    projectId: read("FIREBASE_PROJECT_ID"),
    clientEmail: read("FIREBASE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(read("FIREBASE_PRIVATE_KEY")),
  },

  worker: {
    // Shared secret for the /api/jobs/drain endpoint (cron trigger).
    cronSecret: read("CRON_SECRET"),
    // Run the in-process poller. Off on serverless, on for a standalone node.
    inlinePoller: readBool("WORKER_INLINE_POLLER", false),
    pollIntervalMs: readInt("WORKER_POLL_INTERVAL_MS", 5000),
    maxJobsPerDrain: readInt("WORKER_MAX_JOBS_PER_DRAIN", 3),
  },

  cors: {
    // Comma-separated list. Empty means "reflect the request origin",
    // which is what we want for same-origin Vercel deployments.
    origins: (read("CORS_ORIGINS", "") || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  },

  app: {
    // Used to build password-reset links in emails.
    publicUrl: read("PUBLIC_APP_URL", "http://localhost:5173"),
  },
}

/** True when the xAI agents can actually run. */
export const isXaiConfigured = () => Boolean(env.xai.apiKey)

/** True when Sarvam voice endpoints can actually run. */
export const isSarvamConfigured = () => Boolean(env.sarvam.apiKey)

/** True when Firebase Admin can verify Google ID tokens. */
export const isFirebaseConfigured = () =>
  Boolean(
    env.firebase.projectId &&
      env.firebase.clientEmail &&
      env.firebase.privateKey,
  )

/** True when YouTube video curation can run against the real API. */
export const isYoutubeConfigured = () => Boolean(env.youtube.apiKey)

/**
 * Throws when Supabase credentials are absent — without a database there is
 * nothing meaningful the API can do, so failing loudly at boot is correct.
 */
export function assertRequiredEnv() {
  const missing = REQUIRED.filter((key) => {
    if (key === "SUPABASE_URL") return !env.supabase.url
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return !env.supabase.serviceRoleKey
    return !process.env[key]
  })

  if (missing.length > 0) {
    throw new Error(
      `[kyren] Missing required environment variables: ${missing.join(", ")}. ` +
        "Connect the Supabase integration to provide them.",
    )
  }
}

/**
 * Refuses to boot in production with the development JWT fallbacks, which
 * would otherwise let anyone forge a token with a publicly known secret.
 */
export function assertProductionSecrets() {
  if (!env.isProduction) return

  const weak = []
  if (env.jwt.accessSecret.startsWith("kyren-dev-")) weak.push("JWT_SECRET")
  if (env.jwt.refreshSecret.startsWith("kyren-dev-")) {
    weak.push("JWT_REFRESH_SECRET")
  }

  if (weak.length > 0) {
    throw new Error(
      `[kyren] Refusing to start in production with development secrets: ${weak.join(", ")}.`,
    )
  }
}
