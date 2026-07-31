/**
 * Video Selector Service.
 *
 * Given a ranked list of videos, selects a diverse set of 3-4 videos for
 * a lesson with these constraints:
 *
 *   - No duplicate YouTube IDs.
 *   - No same channel twice (channel diversity).
 *   - Ordered from beginner → advanced by rank position.
 *   - Cascading score thresholds to fill slots when high-quality results
 *     are scarce.
 */

import { getFallbackVideoLibrary } from "../ai/fallback-templates.js"

/**
 * Selects up to `count` diverse videos from a pre-ranked array.
 *
 * Selection cascade:
 *   Pass 1: compositeScore ≥ 80
 *   Pass 2: compositeScore ≥ 60
 *   Pass 3: compositeScore ≥ 40
 *   Pass 4: accept any remaining
 *   Pass 5: fill from fallback template library
 *
 * @param {object[]} rankedVideos  Videos sorted descending by compositeScore.
 * @param {string}   topic         Lesson topic (used for fallback lookup).
 * @param {number}   [count=4]     Target number of videos.
 * @returns {{ videos: object[], usedFallback: boolean }}
 */
export function selectVideosForLesson(rankedVideos, topic, count = 4) {
  const selected = []
  const usedYoutubeIds = new Set()
  const usedChannels   = new Set()

  /**
   * Attempts to pick videos from `pool` that haven't been selected yet.
   * Respects the channel-diversity and ID-uniqueness constraints.
   */
  const pickFrom = (pool) => {
    for (const video of pool) {
      if (selected.length >= count) break

      const vid     = video.youtubeId || video.youtube_video_id
      const channel = (video.channelName || "").toLowerCase()

      // Skip duplicates
      if (vid && usedYoutubeIds.has(vid)) continue
      // Skip same channel (unless we're running low on options)
      if (channel && usedChannels.has(channel) && selected.length < count - 1) continue

      selected.push(video)
      if (vid) usedYoutubeIds.add(vid)
      if (channel) usedChannels.add(channel)
    }
  }

  // Cascade through quality thresholds
  const thresholds = [80, 60, 40, 0]
  for (const threshold of thresholds) {
    if (selected.length >= count) break
    const pool = rankedVideos.filter(
      (v) =>
        v.compositeScore >= threshold &&
        !usedYoutubeIds.has(v.youtubeId || v.youtube_video_id),
    )
    pickFrom(pool)
  }

  // If still short, relax the channel constraint and try again
  if (selected.length < count) {
    for (const video of rankedVideos) {
      if (selected.length >= count) break
      const vid = video.youtubeId || video.youtube_video_id
      if (vid && usedYoutubeIds.has(vid)) continue
      selected.push(video)
      usedYoutubeIds.add(vid)
    }
  }

  // Fallback: fill remaining slots from template library
  let usedFallback = false
  if (selected.length < count) {
    usedFallback = true
    const fallback = getFallbackVideoLibrary(topic)
    for (const fb of fallback.videos) {
      if (selected.length >= count) break
      const vid = fb.youtube_video_id
      if (vid && usedYoutubeIds.has(vid)) continue

      selected.push({
        youtubeId: vid,
        title: fb.title,
        description: `Fallback video resource for ${topic}`,
        channelName: "Educational Hub",
        durationSeconds: 600,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        publishedAt: null,
        compositeScore: 30,
        _scores: { channel: 50, quality: 0, duration: 80, relevance: 50 },
        _isFallback: true,
      })
      if (vid) usedYoutubeIds.add(vid)
    }
  }

  // Assign video_number (1-based) for DB ordering
  return {
    videos: selected.map((v, i) => ({ ...v, videoNumber: i + 1 })),
    usedFallback,
  }
}
