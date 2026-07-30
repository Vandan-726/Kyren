/**
 * User account and learning profile.
 *
 * The schema splits identity (`users`) from learning preferences
 * (`student_profiles`). This service is the only place that seam is crossed,
 * so callers deal with one object instead of two tables.
 *
 * Every function takes an explicit `userId` sourced from `req.user.id`.
 * Nothing here ever trusts an id supplied in a request body.
 */

import { supabase, unwrap } from "../config/supabase.js"
import { USER_COLUMNS, decorateUser, getUserById } from "./authService.js"

/** Fields that count toward the profile-completeness meter. */
const COMPLETENESS_FIELDS = [
  "education_level",
  "learning_goal",
  "learning_pace",
  "learning_style",
  "country",
  "timezone",
]

function computeCompleteness(profile) {
  const filled = COMPLETENESS_FIELDS.filter((key) => {
    const value = profile?.[key]
    return value !== null && value !== undefined && String(value).trim() !== ""
  }).length
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 10000) / 100
}

export async function getProfile(userId) {
  return getUserById(userId)
}

export async function updateProfile(userId, patch) {
  if (Object.keys(patch).length === 0) return getUserById(userId)

  const row = unwrap(
    await supabase
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select(`${USER_COLUMNS}, password_hash, firebase_uid`)
      .single(),
    "Updating user",
  )
  return decorateUser(row)
}

/** Reads the learning profile, self-healing if the row is somehow absent. */
export async function getLearningProfile(userId) {
  const existing = unwrap(
    await supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
    "Loading learning profile",
  )
  if (existing) return existing

  return unwrap(
    await supabase.from("student_profiles").insert({ user_id: userId }).select("*").single(),
    "Creating learning profile",
  )
}

export async function updateLearningProfile(userId, patch) {
  const current = await getLearningProfile(userId)
  const merged = { ...current, ...patch }

  return unwrap(
    await supabase
      .from("student_profiles")
      .update({ ...patch, profile_completeness: computeCompleteness(merged) })
      .eq("user_id", userId)
      .select("*")
      .single(),
    "Updating learning profile",
  )
}

/**
 * Completes onboarding atomically from the client's perspective: writes both
 * halves, then flips the flag that stops the app redirecting back into the
 * wizard. The flag is set last so a partial failure retries the wizard rather
 * than dropping the user into an app with no profile.
 */
export async function completeOnboarding(userId, { account = {}, profile = {} }) {
  const learningProfile = await updateLearningProfile(userId, profile)
  const user = await updateProfile(userId, { ...account, onboarding_completed: true })

  return { user, profile: learningProfile }
}

/** Everything the dashboard header needs, in one round trip per source. */
export async function getStats(userId) {
  const [streak, progress, attempts] = await Promise.all([
    supabase.from("learning_streaks").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("student_progress")
      .select("status, overall_completion_percentage, total_time_spent_minutes")
      .eq("user_id", userId),
    supabase
      .from("quiz_attempts")
      .select("score, passed")
      .eq("user_id", userId)
      .not("submitted_at", "is", null),
  ])

  const progressRows = progress.data ?? []
  const attemptRows = attempts.data ?? []
  const scored = attemptRows.filter((row) => row.score !== null)

  const averageScore =
    scored.length > 0 ? scored.reduce((sum, row) => sum + Number(row.score), 0) / scored.length : null

  return {
    currentStreakDays: streak.data?.current_streak_days ?? 0,
    longestStreakDays: streak.data?.longest_streak_days ?? 0,
    coursesEnrolled: progressRows.length,
    coursesCompleted: progressRows.filter((row) => row.status === "completed").length,
    coursesInProgress: progressRows.filter((row) => row.status === "in_progress").length,
    quizzesTaken: attemptRows.length,
    quizzesPassed: attemptRows.filter((row) => row.passed).length,
    averageQuizScore: averageScore === null ? null : Math.round(averageScore * 100) / 100,
    totalMinutesLearned: progressRows.reduce((sum, row) => sum + (row.total_time_spent_minutes ?? 0), 0),
  }
}

/** Live sessions, so a user can audit and revoke their own devices. */
export async function listSessions(userId) {
  return unwrap(
    await supabase
      .from("auth_sessions")
      .select("id, ip_address, user_agent, created_at, last_activity, expires_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    "Listing sessions",
  )
}
