/**
 * Lightweight in-memory LRU cache with TTL support.
 *
 * Used by the orchestration engine to cache student context (profile, mastery,
 * gaps, quiz history) so repeated AI requests within the same session do not
 * re-query the database every time.
 *
 * Design decisions:
 *   - Map preserves insertion order, so the oldest entry is always first.
 *   - Lazy eviction on `get`: expired entries are removed when accessed.
 *   - Hard cap of `maxEntries` prevents unbounded memory growth.
 *   - No external dependency — swappable to Redis later if needed.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_MAX_ENTRIES = 500

export class ContextCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs]       Default TTL in milliseconds.
   * @param {number} [options.maxEntries]  Maximum entries before LRU eviction.
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this._store = new Map()
    this._defaultTtlMs = ttlMs
    this._maxEntries = maxEntries
  }

  /**
   * Returns the cached value, or `null` if missing or expired.
   * Accessing an entry promotes it to "most recently used".
   *
   * @param {string} key
   * @returns {unknown | null}
   */
  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return null
    }

    // Promote to most-recently-used by re-inserting.
    this._store.delete(key)
    this._store.set(key, entry)
    return entry.value
  }

  /**
   * Stores a value with an optional per-entry TTL override.
   *
   * @param {string}  key
   * @param {unknown} value
   * @param {number}  [ttlMs]  Override the default TTL for this entry.
   */
  set(key, value, ttlMs) {
    // Remove first so re-insertion goes to the end (most recent).
    this._store.delete(key)

    // Evict the oldest entry if at capacity.
    if (this._store.size >= this._maxEntries) {
      const oldest = this._store.keys().next().value
      this._store.delete(oldest)
    }

    this._store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this._defaultTtlMs),
    })
  }

  /**
   * Manually evicts a key. Call this when the underlying data changes
   * (e.g. after a mastery score update or profile edit).
   *
   * @param {string} key
   * @returns {boolean} `true` if the key existed.
   */
  invalidate(key) {
    return this._store.delete(key)
  }

  /**
   * Invalidates all entries whose key starts with the given prefix.
   * Useful for flushing all cached context for a specific user.
   *
   * @param {string} prefix
   */
  invalidateByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key)
      }
    }
  }

  /** Flushes every entry. Intended for tests. */
  clear() {
    this._store.clear()
  }

  /** Current number of (possibly expired) entries. */
  get size() {
    return this._store.size
  }
}
