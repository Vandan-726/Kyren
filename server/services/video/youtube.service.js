/**
 * YouTube Service.
 *
 * Full curation pipeline for educational video discovery:
 *
 *   1. Generates 3 intelligent search queries from topic + difficulty.
 *   2. Calls YouTube `search.list` for each query (rate-limited).
 *   3. Deduplicates across queries.
 *   4. Fetches `videos.list` details (duration, stats, channel).
 *   5. Validates (duration 4-25 min, views >10k, uploaded <2 years).
 *   6. Ranks via the VideoRanker weighted algorithm.
 *   7. Selects 3-4 diverse videos via the VideoSelector.
 *   8. Caches results for 24 hours.
 *
 * Exports a single high-level function `curateVideosForLesson` that
 * the job-queue service calls.
 */

import { env } from "../../config/env.js"
import { ContextCache } from "../ai/context-cache.js"
import { rankVideos, getChannelTrustScore } from "./video-ranker.service.js"
import { selectVideosForLesson } from "./video-selector.service.js"
import { getFallbackVideoLibrary } from "../ai/fallback-templates.js"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Search result cache (24h TTL, 2000 entries max)
// ---------------------------------------------------------------------------

const videoSearchCache = new ContextCache({
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 2000,
})

// ---------------------------------------------------------------------------
// ISO 8601 duration parser
// ---------------------------------------------------------------------------

/**
 * Converts an ISO 8601 duration string (e.g. "PT12M34S") to seconds.
 *
 * @param {string} iso
 * @returns {number}
 */
function parseIsoDuration(iso) {
  if (!iso) return 0
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours   = parseInt(match[1] || "0", 10)
  const minutes = parseInt(match[2] || "0", 10)
  const seconds = parseInt(match[3] || "0", 10)
  return hours * 3600 + minutes * 60 + seconds
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

/**
 * Generates 3 varied search queries to maximise result diversity.
 *
 * @param {string} topic      e.g. "Variables in C"
 * @param {string} difficulty  "beginner" | "intermediate" | "advanced"
 * @returns {string[]}
 */
function buildSearchQueries(topic, difficulty = "beginner") {
  const diffLabel = {
    beginner: "for beginners",
    intermediate: "tutorial",
    advanced: "deep dive advanced",
  }[difficulty] || "tutorial"

  return [
    `${topic} programming tutorial ${diffLabel}`,
    `how ${topic} works programming basics explained`,
    `understanding ${topic} ${difficulty} level tutorial`,
  ]
}

// ---------------------------------------------------------------------------
// YouTube API calls
// ---------------------------------------------------------------------------

/**
 * Calls YouTube `search.list` for a single query.
 *
 * @param {string} query
 * @param {string} apiKey
 * @param {number} [maxResults=15]
 * @returns {Promise<object[]>}  Array of { videoId, snippet }
 */
async function fetchSearchResults(query, apiKey, maxResults = 15) {
  const params = new URLSearchParams({
    part: "snippet",
    maxResults: String(maxResults),
    q: query,
    type: "video",
    order: "relevance",
    videoDuration: "medium", // 4-20 min
    safeSearch: "strict",
    key: apiKey,
  })

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`
  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`[YouTube] search.list ${res.status}: ${body.slice(0, 200)}`)
    return []
  }

  const data = await res.json()
  return (data.items || []).map((item) => ({
    videoId: item.id?.videoId,
    title: item.snippet?.title,
    description: item.snippet?.description,
    channelName: item.snippet?.channelTitle,
    publishedAt: item.snippet?.publishedAt,
  }))
}

/**
 * Fetches detailed video metadata (duration, stats) in a single batch.
 *
 * @param {string[]} videoIds
 * @param {string}   apiKey
 * @returns {Promise<Map<string, object>>}  videoId → details
 */
async function fetchVideoDetails(videoIds, apiKey) {
  const details = new Map()
  if (videoIds.length === 0) return details

  // YouTube allows up to 50 IDs per call
  const batchSize = 50
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    const params = new URLSearchParams({
      part: "contentDetails,statistics",
      id: batch.join(","),
      key: apiKey,
    })

    const url = `https://www.googleapis.com/youtube/v3/videos?${params}`
    const res = await fetch(url)

    if (!res.ok) {
      console.error(`[YouTube] videos.list ${res.status}`)
      continue
    }

    const data = await res.json()
    for (const item of data.items || []) {
      details.set(item.id, {
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        viewCount:       parseInt(item.statistics?.viewCount    || "0", 10),
        likeCount:       parseInt(item.statistics?.likeCount    || "0", 10),
        commentCount:    parseInt(item.statistics?.commentCount || "0", 10),
      })
    }
  }

  return details
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000
const MIN_VIEWS    = 10_000
const MIN_DURATION = 4 * 60    // 4 minutes
const MAX_DURATION = 25 * 60   // 25 minutes

/**
 * Validates a video against minimum quality thresholds.
 * Returns `true` if the video passes all checks.
 *
 * @param {object} video  Enriched video object
 * @returns {boolean}
 */
function validateVideo(video) {
  // Duration check
  if (video.durationSeconds < MIN_DURATION || video.durationSeconds > MAX_DURATION) {
    return false
  }

  // View count check (relaxed: only filter if we know the count)
  if (video.viewCount > 0 && video.viewCount < MIN_VIEWS) {
    return false
  }

  // Recency check
  if (video.publishedAt) {
    const ageMs = Date.now() - new Date(video.publishedAt).getTime()
    if (ageMs > TWO_YEARS_MS) {
      // Still allow if from a high-trust channel
      const trust = getChannelTrustScore(video.channelName)
      if (trust < 75) return false
    }
  }

  return true
}

/**
 * Relaxed validation for the second pass (wider funnel).
 */
function validateVideoRelaxed(video) {
  // Accept 4-30 min
  if (video.durationSeconds < 4 * 60 || video.durationSeconds > 30 * 60) {
    return false
  }
  // Accept any view count > 1000
  if (video.viewCount > 0 && video.viewCount < 1000) {
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// High-level curation pipeline
// ---------------------------------------------------------------------------

/**
 * Full curation pipeline: search → deduplicate → detail-fetch → validate →
 * rank → select.
 *
 * @param {object} opts
 * @param {string} opts.topic        Lesson title / topic string.
 * @param {string} [opts.difficulty] "beginner" | "intermediate" | "advanced"
 * @param {string} [opts.language]   Language code (used as search hint).
 * @param {string[]} [opts.keyConcepts]  Key concept strings for relevance scoring.
 * @param {number} [opts.count]      Number of videos to select (default 4).
 * @returns {Promise<{ videos: object[], usedFallback: boolean, fromCache: boolean }>}
 */
export async function curateVideosForLesson({
  topic,
  difficulty = "beginner",
  language = "en",
  keyConcepts = [],
  count = 4,
}) {
  const apiKey = env.youtube.apiKey

  // -- Cache check --
  const cacheKey = `video_search:${topic.toLowerCase().trim()}:${difficulty}`
  const cached = videoSearchCache.get(cacheKey)
  if (cached) {
    console.log(`[YouTube] Cache hit for "${topic}" (${difficulty})`)
    // Re-select from cached ranked list (selection is cheap)
    const { videos, usedFallback } = selectVideosForLesson(cached, topic, count)
    return { videos, usedFallback, fromCache: true }
  }

  // -- No API key: full fallback --
  if (!apiKey) {
    console.warn("[YouTube] No API key configured. Using fallback library.")
    const fallback = getFallbackVideoLibrary(topic)
    return {
      videos: fallback.videos.slice(0, count).map((v, i) => ({
        ...v,
        youtubeId: v.youtube_video_id,
        videoNumber: i + 1,
        compositeScore: 30,
        _isFallback: true,
      })),
      usedFallback: true,
      fromCache: false,
    }
  }

  // -- Build queries and search --
  const queries = buildSearchQueries(topic, difficulty)
  const allRaw  = []
  const seenIds = new Set()

  for (let i = 0; i < queries.length; i++) {
    // Rate limit: 2 seconds between searches
    if (i > 0) await sleep(2000)

    try {
      const results = await fetchSearchResults(queries[i], apiKey, 15)
      for (const r of results) {
        if (r.videoId && !seenIds.has(r.videoId)) {
          seenIds.add(r.videoId)
          allRaw.push(r)
        }
      }
    } catch (err) {
      console.error(`[YouTube] Search query ${i + 1} failed:`, err.message)
    }
  }

  console.log(`[YouTube] Found ${allRaw.length} unique videos for "${topic}"`)

  if (allRaw.length === 0) {
    // Complete search failure — fallback
    const fallback = getFallbackVideoLibrary(topic)
    return {
      videos: fallback.videos.slice(0, count).map((v, i) => ({
        ...v,
        youtubeId: v.youtube_video_id,
        videoNumber: i + 1,
        compositeScore: 30,
        _isFallback: true,
      })),
      usedFallback: true,
      fromCache: false,
    }
  }

  // -- Fetch video details (duration, stats) --
  const videoIds = allRaw.map((r) => r.videoId)
  let detailsMap

  try {
    detailsMap = await fetchVideoDetails(videoIds, apiKey)
  } catch (err) {
    console.error("[YouTube] Failed to fetch video details:", err.message)
    detailsMap = new Map()
  }

  // -- Merge and enrich --
  const enriched = allRaw.map((raw) => {
    const details = detailsMap.get(raw.videoId) || {}
    return {
      youtubeId:       raw.videoId,
      title:           raw.title,
      description:     raw.description,
      channelName:     raw.channelName,
      publishedAt:     raw.publishedAt,
      durationSeconds: details.durationSeconds || 0,
      viewCount:       details.viewCount       || 0,
      likeCount:       details.likeCount       || 0,
      commentCount:    details.commentCount     || 0,
    }
  })

  // -- Validate (strict pass first, relaxed pass if insufficient) --
  let validated = enriched.filter(validateVideo)

  if (validated.length < count) {
    // Add videos that pass relaxed criteria but not strict
    const relaxed = enriched.filter(
      (v) => !validated.includes(v) && validateVideoRelaxed(v),
    )
    validated = [...validated, ...relaxed]
  }

  console.log(`[YouTube] ${validated.length} videos passed validation for "${topic}"`)

  // -- Rank --
  const ranked = rankVideos(validated, topic, keyConcepts)

  // -- Cache the ranked results --
  videoSearchCache.set(cacheKey, ranked)

  // -- Select --
  const { videos, usedFallback } = selectVideosForLesson(ranked, topic, count)

  return { videos, usedFallback, fromCache: false }
}

// Export internals for testing
export {
  buildSearchQueries,
  fetchSearchResults,
  fetchVideoDetails,
  parseIsoDuration,
  validateVideo,
  validateVideoRelaxed,
  videoSearchCache,
}
