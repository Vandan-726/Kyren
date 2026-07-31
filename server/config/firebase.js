import { getApps, initializeApp, cert, getApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

import { env, isFirebaseConfigured as checkConfig } from "./env.js"

/**
 * Firebase Admin is used for exactly one job: verifying the Google ID token
 * the browser obtains via the Firebase client SDK. Everything after that
 * verification is our own JWT + auth_sessions machinery.
 *
 * The whole module is optional by design. If the service-account vars are not
 * set the app still boots and email/password auth works normally -- only the
 * Google button reports "not configured". This keeps `pnpm dev` usable before
 * any Firebase project exists.
 */

let app = null
let initError = null

function initialize() {
  if (app || initError) return

  if (!checkConfig()) {
    initError = new Error("Firebase Admin is not configured")
    return
  }

  try {
    // Reuse an existing app across serverless invocations / HMR reloads.
    app = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId: env.firebase.projectId,
            clientEmail: env.firebase.clientEmail,
            privateKey: env.firebase.privateKey,
          }),
        })
  } catch (error) {
    initError = error
    console.error("[v0] Firebase Admin init failed:", error.message)
  }
}

export function isFirebaseConfigured() {
  return checkConfig()
}

/**
 * Verify a Google ID token minted by the Firebase client SDK.
 *
 * Returns the decoded token on success. Throws a plain Error on failure so the
 * caller can decide the HTTP shape (we surface 503 when unconfigured and 401
 * when the token itself is bad).
 */
export async function verifyFirebaseIdToken(idToken) {
  initialize()

  if (!app) {
    const error = new Error(
      "Google sign-in is not configured on this server. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    )
    error.code = "FIREBASE_NOT_CONFIGURED"
    throw error
  }

  // checkRevoked: true means a disabled/deleted Firebase user cannot keep
  // trading a still-unexpired ID token for fresh KYREN sessions.
  return getAuth(app).verifyIdToken(idToken, true)
}
