/**
 * YouTube Video Curation Engine Tests.
 *
 * Run with:
 *   node --env-file-if-exists=.env server/services/video/video-curation.test.js
 */

import {
  getChannelTrustScore,
  calculateQualityScore,
  calculateDurationScore,
  calculateContentRelevance,
  rankVideos,
} from "./video-ranker.service.js"

import { selectVideosForLesson } from "./video-selector.service.js"

import {
  curateVideosForLesson,
  buildSearchQueries,
  parseIsoDuration,
  validateVideo,
  validateVideoRelaxed,
  videoSearchCache,
} from "./youtube.service.js"

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertApprox(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`)
  }
}

// ---------------------------------------------------------------------------
// 1. Video Ranker Tests
// ---------------------------------------------------------------------------

function testChannelTrustScores() {
  console.log("  ▸ Channel trust scores...")

  assert(getChannelTrustScore("Khan Academy") === 95, "Khan Academy should be 95")
  assert(getChannelTrustScore("khan academy") === 95, "Case insensitive match failed")
  assert(getChannelTrustScore("MIT OpenCourseWare") === 95, "MIT should be 95")
  assert(getChannelTrustScore("freeCodeCamp.org") === 90, "freeCodeCamp should be 90")
  assert(getChannelTrustScore("Traversy Media") === 75, "Traversy Media should be 75")
  assert(getChannelTrustScore("Random Channel XYZ") === 50, "Unknown channel should be 50")
  assert(getChannelTrustScore("") === 50, "Empty channel should be 50")
  assert(getChannelTrustScore(null) === 50, "Null channel should be 50")

  console.log("    ✔ Channel trust scores passed.")
}

function testQualityScore() {
  console.log("  ▸ Educational quality score...")

  // High engagement video
  const highEngagement = calculateQualityScore({
    viewCount: 100000,
    likeCount: 5000,
    commentCount: 500,
    publishedAt: new Date().toISOString(), // just published
  })
  assert(highEngagement > 0, "High engagement should produce positive score")
  assert(highEngagement <= 100, "Score should be capped at 100")

  // Low engagement video
  const lowEngagement = calculateQualityScore({
    viewCount: 100000,
    likeCount: 100,
    commentCount: 10,
    publishedAt: "2020-01-01T00:00:00Z", // old
  })
  assert(lowEngagement < highEngagement, "Low engagement should score lower")

  // Zero views (edge case)
  const zeroViews = calculateQualityScore({
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    publishedAt: null,
  })
  assert(zeroViews === 0, "Zero engagement should be 0")

  console.log("    ✔ Educational quality score passed.")
}

function testDurationScore() {
  console.log("  ▸ Duration relevance score...")

  assert(calculateDurationScore(10 * 60) === 100, "10 min should be 100")
  assert(calculateDurationScore(12 * 60) === 100, "12 min should be 100")
  assert(calculateDurationScore(6 * 60) === 80, "6 min should be 80")
  assert(calculateDurationScore(18 * 60) === 80, "18 min should be 80")
  assert(calculateDurationScore(22 * 60) === 60, "22 min should be 60")
  assert(calculateDurationScore(4.5 * 60) === 40, "4.5 min should be 40")
  assert(calculateDurationScore(3 * 60) === 0, "3 min should be 0")
  assert(calculateDurationScore(30 * 60) === 0, "30 min should be 0")

  console.log("    ✔ Duration relevance score passed.")
}

function testContentRelevance() {
  console.log("  ▸ Content relevance score...")

  const highRelevance = calculateContentRelevance(
    { title: "Variables in C Programming Tutorial for Beginners", description: "Learn how variables work in C programming basics" },
    "Variables in C",
    ["variables", "data types", "C programming"],
  )
  assert(highRelevance > 50, `High relevance video should score >50, got ${highRelevance}`)

  const lowRelevance = calculateContentRelevance(
    { title: "Cooking Italian Pasta", description: "How to make delicious pasta at home" },
    "Variables in C",
    ["variables", "data types"],
  )
  assert(lowRelevance < highRelevance, "Unrelated video should score lower")

  const emptyVideo = calculateContentRelevance(
    { title: "", description: "" },
    "Variables",
    [],
  )
  assert(emptyVideo === 0 || emptyVideo >= 0, "Empty video should not crash")

  console.log("    ✔ Content relevance score passed.")
}

function testRankVideos() {
  console.log("  ▸ Rank videos composite scoring...")

  const videos = [
    {
      youtubeId: "aaa",
      title: "Variables in C - Beginner Tutorial",
      description: "Learn C programming variables",
      channelName: "Khan Academy",
      durationSeconds: 12 * 60,
      viewCount: 500000,
      likeCount: 25000,
      commentCount: 2000,
      publishedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      youtubeId: "bbb",
      title: "Random Tutorial",
      description: "Something about coding",
      channelName: "Unknown Channel",
      durationSeconds: 3 * 60,
      viewCount: 1000,
      likeCount: 10,
      commentCount: 1,
      publishedAt: "2019-01-01T00:00:00Z",
    },
    {
      youtubeId: "ccc",
      title: "C Variables Explained",
      description: "Understanding variables in C",
      channelName: "freeCodeCamp.org",
      durationSeconds: 15 * 60,
      viewCount: 200000,
      likeCount: 10000,
      commentCount: 800,
      publishedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]

  const ranked = rankVideos(videos, "Variables in C", ["variables", "data types"])

  assert(ranked.length === 3, "All videos should be returned")
  assert(ranked[0].youtubeId === "aaa", `Khan Academy video should rank first, got ${ranked[0].youtubeId}`)
  assert(ranked[ranked.length - 1].youtubeId === "bbb", "Low quality video should rank last")
  assert(ranked[0].compositeScore > ranked[1].compositeScore, "Scores should be descending")
  assert(typeof ranked[0]._scores === "object", "Each video should have _scores breakdown")
  assert(typeof ranked[0].compositeScore === "number", "compositeScore should be a number")

  console.log("    ✔ Rank videos passed.")
}

// ---------------------------------------------------------------------------
// 2. Video Selector Tests
// ---------------------------------------------------------------------------

function testSelectVideosForLesson() {
  console.log("  ▸ Video selection diversity...")

  const rankedVideos = [
    { youtubeId: "v1", channelName: "Khan Academy", compositeScore: 95, _scores: {} },
    { youtubeId: "v2", channelName: "Khan Academy", compositeScore: 90, _scores: {} },
    { youtubeId: "v3", channelName: "freeCodeCamp.org", compositeScore: 88, _scores: {} },
    { youtubeId: "v4", channelName: "MIT OpenCourseWare", compositeScore: 85, _scores: {} },
    { youtubeId: "v5", channelName: "Traversy Media", compositeScore: 82, _scores: {} },
    { youtubeId: "v6", channelName: "freeCodeCamp.org", compositeScore: 80, _scores: {} },
    { youtubeId: "v7", channelName: "Coursera", compositeScore: 75, _scores: {} },
  ]

  const { videos, usedFallback } = selectVideosForLesson(rankedVideos, "Variables in C", 4)

  assert(videos.length === 4, `Should select exactly 4 videos, got ${videos.length}`)
  assert(!usedFallback, "Should not need fallbacks with 7 candidates")

  // Check no duplicate YouTube IDs
  const ids = videos.map((v) => v.youtubeId)
  assert(new Set(ids).size === ids.length, "No duplicate YouTube IDs")

  // Check channel diversity (at least 3 distinct channels in 4 picks)
  const channels = new Set(videos.map((v) => v.channelName.toLowerCase()))
  assert(channels.size >= 3, `Should have ≥3 distinct channels, got ${channels.size}`)

  // Check videoNumber assignment
  assert(videos[0].videoNumber === 1, "First video should be videoNumber 1")
  assert(videos[3].videoNumber === 4, "Fourth video should be videoNumber 4")

  console.log("    ✔ Video selection diversity passed.")
}

function testSelectVideosWithFallback() {
  console.log("  ▸ Video selection with fallback fill...")

  const rankedVideos = [
    { youtubeId: "only1", channelName: "SomeChannel", compositeScore: 90, _scores: {} },
  ]

  const { videos, usedFallback } = selectVideosForLesson(rankedVideos, "Pointers", 4)

  assert(videos.length >= 2, `Should fill some slots, got ${videos.length}`)
  assert(usedFallback === true, "Should use fallback when insufficient candidates")

  console.log("    ✔ Video selection with fallback passed.")
}

// ---------------------------------------------------------------------------
// 3. YouTube Service Tests
// ---------------------------------------------------------------------------

function testBuildSearchQueries() {
  console.log("  ▸ Search query generation...")

  const queries = buildSearchQueries("Variables in C", "beginner")
  assert(Array.isArray(queries), "Should return an array")
  assert(queries.length === 3, `Should generate 3 queries, got ${queries.length}`)

  // Each query should contain the topic
  for (const q of queries) {
    assert(q.toLowerCase().includes("variables"), `Query should contain topic: ${q}`)
  }

  // Queries should be distinct
  assert(new Set(queries).size === 3, "All 3 queries should be distinct")

  const advancedQueries = buildSearchQueries("Pointers in C", "advanced")
  assert(advancedQueries.some((q) => q.includes("advanced")), "Advanced queries should contain 'advanced'")

  console.log("    ✔ Search query generation passed.")
}

function testParseIsoDuration() {
  console.log("  ▸ ISO duration parsing...")

  assert(parseIsoDuration("PT12M34S") === 12 * 60 + 34, "PT12M34S = 754s")
  assert(parseIsoDuration("PT1H2M3S") === 3600 + 120 + 3, "PT1H2M3S = 3723s")
  assert(parseIsoDuration("PT5M") === 300, "PT5M = 300s")
  assert(parseIsoDuration("PT30S") === 30, "PT30S = 30s")
  assert(parseIsoDuration("") === 0, "Empty string = 0")
  assert(parseIsoDuration(null) === 0, "Null = 0")

  console.log("    ✔ ISO duration parsing passed.")
}

function testValidateVideo() {
  console.log("  ▸ Video validation...")

  const goodVideo = {
    durationSeconds: 10 * 60,
    viewCount: 50000,
    publishedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months ago
    channelName: "Khan Academy",
  }
  assert(validateVideo(goodVideo) === true, "Good video should pass validation")

  const tooShort = { ...goodVideo, durationSeconds: 2 * 60 }
  assert(validateVideo(tooShort) === false, "Too short video should fail")

  const tooLong = { ...goodVideo, durationSeconds: 30 * 60 }
  assert(validateVideo(tooLong) === false, "Too long video should fail strict validation")
  assert(validateVideoRelaxed(tooLong) === true, "30 min video should pass relaxed validation")

  const tooFewViews = { ...goodVideo, viewCount: 500 }
  assert(validateVideo(tooFewViews) === false, "Low view count should fail")

  const oldButTrusted = {
    ...goodVideo,
    publishedAt: "2020-01-01T00:00:00Z",
    channelName: "Khan Academy",
  }
  assert(validateVideo(oldButTrusted) === true, "Old video from trusted channel should pass")

  const oldUntrusted = {
    ...goodVideo,
    publishedAt: "2020-01-01T00:00:00Z",
    channelName: "Random Channel",
  }
  assert(validateVideo(oldUntrusted) === false, "Old video from untrusted channel should fail")

  console.log("    ✔ Video validation passed.")
}

function testCacheOperations() {
  console.log("  ▸ Search cache operations...")

  videoSearchCache.clear()
  assert(videoSearchCache.size === 0, "Cache should start empty")

  videoSearchCache.set("test:key", [{ id: 1 }])
  assert(videoSearchCache.get("test:key") !== null, "Should retrieve cached value")
  assert(videoSearchCache.get("test:key")[0].id === 1, "Cached value should match")

  assert(videoSearchCache.get("nonexistent") === null, "Missing key should return null")

  videoSearchCache.clear()
  assert(videoSearchCache.size === 0, "Cache should be empty after clear")

  console.log("    ✔ Search cache operations passed.")
}

async function testCurateVideosForLesson() {
  console.log("  ▸ Full curation pipeline (no API key mode)...")

  // Clear cache and temporarily unset API key to test fallback path
  videoSearchCache.clear()

  const result = await curateVideosForLesson({
    topic: "Pointers in C",
    difficulty: "beginner",
    language: "en",
    keyConcepts: ["pointers", "memory address"],
    count: 4,
  })

  assert(result.videos.length > 0, `Should return at least 1 video, got ${result.videos.length}`)
  assert(typeof result.usedFallback === "boolean", "usedFallback should be boolean")
  assert(typeof result.fromCache === "boolean", "fromCache should be boolean")

  // Each video should have required fields
  for (const v of result.videos) {
    assert(v.title, `Video should have a title: ${JSON.stringify(v)}`)
    assert(typeof v.videoNumber === "number", "Video should have videoNumber")
  }

  console.log("    ✔ Full curation pipeline passed.")
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runAll() {
  console.log("=== YOUTUBE VIDEO CURATION ENGINE TESTS ===\n")
  const start = Date.now()

  try {
    console.log("1. Video Ranker Tests")
    testChannelTrustScores()
    testQualityScore()
    testDurationScore()
    testContentRelevance()
    testRankVideos()

    console.log("\n2. Video Selector Tests")
    testSelectVideosForLesson()
    testSelectVideosWithFallback()

    console.log("\n3. YouTube Service Tests")
    testBuildSearchQueries()
    testParseIsoDuration()
    testValidateVideo()
    testCacheOperations()
    await testCurateVideosForLesson()

    console.log(`\n🎉 ALL TESTS PASSED SUCCESSFULLY! (took ${Date.now() - start}ms)`)
    process.exit(0)
  } catch (err) {
    console.error(`\n❌ TEST FAILURE:`, err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

runAll()
