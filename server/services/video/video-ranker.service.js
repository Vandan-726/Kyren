/**
 * Video Ranker Service.
 *
 * Scores and sorts YouTube videos using a weighted composite of four criteria:
 *
 *   1. Channel Authority  (40%) — hardcoded trust scores for known edu channels.
 *   2. Educational Quality (25%) — engagement ratios + recency.
 *   3. Duration Relevance  (20%) — ideal range is 8-15 minutes.
 *   4. Content Relevance   (15%) — keyword overlap with lesson topic.
 */

// ---------------------------------------------------------------------------
// Channel trust scores (0-100)
// ---------------------------------------------------------------------------

const CHANNEL_TRUST_SCORES = {
  "khan academy":           95,
  "mit opencourseware":     95,
  "freecodecamp":           90,
  "freecodecamp.org":       90,
  "coursera":               85,
  "edx":                    85,
  "stanford online":        85,
  "stanford":               85,
  "nptel":                  80,
  "neso academy":           80,
  "jenny's lectures cs it": 78,
  "jenny's lectures":       78,
  "abdul bari":             78,
  "mycodeschool":           78,
  "traversy media":         75,
  "the coding train":       75,
  "corey schafer":          75,
  "programming with mosh":  75,
  "fireship":               73,
  "web dev simplified":     73,
  "techworld with nana":    70,
  "geeksforgeeks":          70,
  "code with harry":        70,
  "apna college":           70,
  "telusko":                68,
  "bro code":               68,
  "cs dojo":                68,
  "sentdex":                68,
  "the net ninja":          68,
}

const DEFAULT_TRUST_SCORE = 50

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHT_CHANNEL   = 0.40
const WEIGHT_QUALITY   = 0.25
const WEIGHT_DURATION  = 0.20
const WEIGHT_RELEVANCE = 0.15

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the channel trust score for a given channel name.
 *
 * @param {string} channelName
 * @returns {number} 0-100
 */
export function getChannelTrustScore(channelName) {
  if (!channelName) return DEFAULT_TRUST_SCORE
  const key = channelName.toLowerCase().trim()
  return CHANNEL_TRUST_SCORES[key] ?? DEFAULT_TRUST_SCORE
}

/**
 * Calculates an educational quality score from engagement metrics.
 *
 * Formula:
 *   (likes/views × 100) × 0.5  +  (comments/views × 100) × 0.3  +  recencyBonus × 0.2
 *
 * @param {object} video
 * @param {number} video.viewCount
 * @param {number} video.likeCount
 * @param {number} video.commentCount
 * @param {string} video.publishedAt   ISO date string
 * @returns {number} 0-100
 */
export function calculateQualityScore(video) {
  const views    = video.viewCount    || 1 // avoid division by zero
  const likes    = video.likeCount    || 0
  const comments = video.commentCount || 0

  // Engagement ratios (capped at 100)
  const likeRatio    = Math.min((likes / views) * 100, 100)
  const commentRatio = Math.min((comments / views) * 100, 100)

  // Recency bonus: full 100 if < 6 months, decays linearly to 0 at 3 years
  let recencyBonus = 0
  if (video.publishedAt) {
    const ageMs = Date.now() - new Date(video.publishedAt).getTime()
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30)
    if (ageMonths <= 6) {
      recencyBonus = 100
    } else if (ageMonths <= 36) {
      recencyBonus = Math.max(0, 100 - ((ageMonths - 6) / 30) * 100)
    }
  }

  const raw = likeRatio * 0.5 + commentRatio * 0.3 + recencyBonus * 0.2
  return Math.min(Math.round(raw * 100) / 100, 100)
}

/**
 * Scores a video's duration against an ideal range.
 *
 *   8-15 min  → 100
 *   5-8 min   →  80
 *   15-20 min →  80
 *   20-25 min →  60
 *   4-5 min   →  40
 *   else      →   0
 *
 * @param {number} durationSeconds
 * @returns {number} 0-100
 */
export function calculateDurationScore(durationSeconds) {
  const mins = durationSeconds / 60
  if (mins >= 8  && mins <= 15) return 100
  if (mins >= 5  && mins <  8)  return 80
  if (mins >  15 && mins <= 20) return 80
  if (mins >  20 && mins <= 25) return 60
  if (mins >= 4  && mins <  5)  return 40
  return 0
}

/**
 * Measures keyword overlap between a video's text and the lesson topic.
 *
 * Checks title + description for:
 *   - Topic words (exact word match)
 *   - Key concept words
 *   - Level keywords ("beginner", "tutorial", etc.)
 *
 * @param {object} video
 * @param {string} video.title
 * @param {string} video.description
 * @param {string} topic
 * @param {string[]} [keyConcepts]
 * @returns {number} 0-100
 */
export function calculateContentRelevance(video, topic, keyConcepts = []) {
  const corpus = `${video.title || ""} ${video.description || ""}`.toLowerCase()

  // Topic keyword matches
  const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const topicHits  = topicWords.filter((w) => corpus.includes(w)).length
  const topicScore = topicWords.length > 0 ? (topicHits / topicWords.length) * 100 : 0

  // Key concept matches
  let conceptScore = 0
  if (keyConcepts.length > 0) {
    const conceptHits = keyConcepts.filter((c) => corpus.includes(c.toLowerCase())).length
    conceptScore = (conceptHits / keyConcepts.length) * 100
  }

  // Level keyword bonus
  const levelKeywords = ["tutorial", "beginner", "learn", "introduction", "intro", "basics", "explained", "course", "how to", "guide"]
  const levelHits = levelKeywords.filter((k) => corpus.includes(k)).length
  const levelScore = Math.min((levelHits / 3) * 100, 100) // 3+ keywords = full score

  // Weighted combination
  const raw = topicScore * 0.50 + conceptScore * 0.30 + levelScore * 0.20
  return Math.min(Math.round(raw * 100) / 100, 100)
}

/**
 * Ranks an array of video objects by composite weighted score.
 *
 * Each video in the returned array has a `_scores` object attached with
 * the per-criterion breakdowns and a `compositeScore` field.
 *
 * @param {object[]} videos
 * @param {string}   topic
 * @param {string[]} [keyConcepts]
 * @returns {object[]} Sorted descending by compositeScore.
 */
export function rankVideos(videos, topic, keyConcepts = []) {
  const scored = videos.map((video) => {
    const channelScore   = getChannelTrustScore(video.channelName) / 100
    const qualityScore   = calculateQualityScore(video) / 100
    const durationScore  = calculateDurationScore(video.durationSeconds) / 100
    const relevanceScore = calculateContentRelevance(video, topic, keyConcepts) / 100

    const compositeScore = Math.round(
      (channelScore   * WEIGHT_CHANNEL +
       qualityScore   * WEIGHT_QUALITY +
       durationScore  * WEIGHT_DURATION +
       relevanceScore * WEIGHT_RELEVANCE) * 10000,
    ) / 100 // → two decimal places, scale 0-100

    return {
      ...video,
      _scores: {
        channel:   Math.round(channelScore * 100),
        quality:   Math.round(qualityScore * 100),
        duration:  Math.round(durationScore * 100),
        relevance: Math.round(relevanceScore * 100),
      },
      compositeScore,
    }
  })

  scored.sort((a, b) => b.compositeScore - a.compositeScore)
  return scored
}
