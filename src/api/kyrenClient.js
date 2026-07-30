/**
 * KYREN HTTP Client — Facade over the Vite-proxied /api backend.
 *
 * Provides a synchronous-like interface backed by Fetch API calls to the local Express server.
 *
 * Usage:
 *   import { kyren } from '@/api/kyrenClient'
 *   const notifs = await kyren.entities.Notification.list()
 *   await kyren.entities.MasteryScore.update(id, { score: 85 })
 */

class EntityProxy {
  constructor(endpoint) {
    this.endpoint = endpoint
  }

  async list(filter = {}, orderBy = null) {
    const query = new URLSearchParams()
    Object.entries(filter).forEach(([k, v]) => {
      if (v != null) query.append(k, v)
    })
    if (orderBy) query.append("orderBy", orderBy)

    const url = `${this.endpoint}?${query}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to list ${this.endpoint}`)
    return res.json()
  }

  async filter(filter = {}, orderBy = null) {
    return this.list(filter, orderBy)
  }

  async get(id) {
    const res = await fetch(`${this.endpoint}/${id}`)
    if (!res.ok) throw new Error(`Failed to get ${this.endpoint}/${id}`)
    return res.json()
  }

  async create(data) {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message || "Failed to create")
    }
    return res.json()
  }

  async update(id, data) {
    const res = await fetch(`${this.endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    })
    if (!res.ok) throw new Error(`Failed to update ${this.endpoint}/${id}`)
    return res.json()
  }

  async bulkUpdate(items) {
    const results = []
    for (const item of items) {
      results.push(await this.update(item.id, item))
    }
    return results
  }

  async delete(id) {
    const res = await fetch(`${this.endpoint}/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!res.ok) throw new Error(`Failed to delete ${this.endpoint}/${id}`)
    return res.ok
  }
}

class EntitiesProxy {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this._cache = {}
  }

  __get(target, prop) {
    if (!this._cache[prop]) {
      this._cache[prop] = new EntityProxy(`${this.baseUrl}/${prop}`)
    }
    return this._cache[prop]
  }

  // Pre-declare common entities for IDE support
  get User() {
    return this.__get(this, "users")
  }
  get Course() {
    return this.__get(this, "courses")
  }
  get Lesson() {
    return this.__get(this, "lessons")
  }
  get StudentProgress() {
    return this.__get(this, "progress")
  }
  get MasteryScore() {
    return this.__get(this, "progress/mastery")
  }
  get QuizAttempt() {
    return this.__get(this, "quizzes")
  }
  get Notification() {
    return this.__get(this, "notifications")
  }
  get LearningGap() {
    return this.__get(this, "learning/gaps")
  }
}

class KyrenClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this.entities = new Proxy(new EntitiesProxy(baseUrl), {
      get: (target, prop) => {
        if (prop === "entities") return target
        return target.__get(target, prop)
      },
    })

    this.auth = {
      loginViaEmailPassword: async (email, password) => {
        const data = await this.request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
        if (data.accessToken) {
          this.setAuthToken(data.accessToken)
        }
        return data
      },
      loginWithProvider: (provider, returnTo) => {
        console.warn("loginWithProvider not implemented natively")
      },
      register: async ({ email, password, fullName }) => {
        const data = await this.request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, fullName }),
        })
        if (data.accessToken) {
          this.setAuthToken(data.accessToken)
        }
        return data
      },
      verifyOtp: async ({ email, otpCode }) => {
        return { access_token: "mock-token" }
      },
      resendOtp: async (email) => {
        return { success: true }
      },
      resetPassword: async ({ resetToken, newPassword }) => {
        return { success: true }
      },
      updateMe: async (data) => {
        const token = this.getAuthToken()
        const headers = {}
        if (token) {
          headers["Authorization"] = `Bearer ${token}`
        }

        const metadataFields = [
          "linked_student_ids",
          "stem_interests",
          "input_preference",
          "current_skill_level",
        ]
        
        const metadata = {}
        const account = {}
        const profile = {}

        if (data.full_name) {
          const parts = data.full_name.trim().split(/\s+/)
          account.first_name = parts[0]
          account.last_name = parts.slice(1).join(" ") || null
        }

        Object.entries(data).forEach(([key, value]) => {
          if (metadataFields.includes(key)) {
            metadata[key] = value
          } else if (["first_name", "last_name", "phone", "avatar_url"].includes(key)) {
            account[key] = value
          } else if ([
            "preferred_language",
            "communication_mode",
            "education_level",
            "learning_goal",
            "learning_pace",
            "learning_style",
            "parent_email",
            "institution_code",
            "country",
            "timezone"
          ].includes(key)) {
            profile[key] = value
          }
        })

        const userId = this._getCurrentUserId()
        if (userId) {
          Object.entries(metadata).forEach(([k, v]) => {
            localStorage.setItem(`${k}_${userId}`, JSON.stringify(v))
          })
        }

        let resUser = null
        if (data.onboarding_complete || data.onboarding_completed) {
          const res = await this.request("/users/me/onboarding", {
            method: "POST",
            headers,
            body: JSON.stringify({ account, profile })
          })
          resUser = res.user
        } else {
          if (Object.keys(profile).length > 0) {
            await this.request("/users/me/profile", {
              method: "PATCH",
              headers,
              body: JSON.stringify(profile)
            })
          }
          if (Object.keys(account).length > 0) {
            resUser = await this.request("/users/me", {
              method: "PATCH",
              headers,
              body: JSON.stringify(account)
            })
          }
        }
        return resUser
      },
      me: async () => {
        const token = this.getAuthToken()
        const headers = {}
        if (token) {
          headers["Authorization"] = `Bearer ${token}`
        }
        const data = await this.request("/auth/me", {
          headers,
        })
        const user = data.user
        const userId = user.id
        if (userId) {
          user.linked_student_ids = JSON.parse(localStorage.getItem(`linked_student_ids_${userId}`) || "[]")
          user.stem_interests = JSON.parse(localStorage.getItem(`stem_interests_${userId}`) || "[]")
          user.input_preference = JSON.parse(localStorage.getItem(`input_preference_${userId}`) || "null")
          user.current_skill_level = JSON.parse(localStorage.getItem(`current_skill_level_${userId}`) || "null")
        }
        return user
      },
      logout: async () => {
        const token = this.getAuthToken()
        const headers = {}
        if (token) {
          headers["Authorization"] = `Bearer ${token}`
        }
        await this.request("/auth/logout", {
          method: "POST",
          headers,
        }).catch(() => {})
        this.clearAuth()
      },
      redirectToLogin: (returnTo) => {
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo || "/")}`
      }
    }
  }

  _getCurrentUserId() {
    const token = this.getAuthToken()
    if (!token) return null
    try {
      const base64Url = token.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      }).join(''))
      const payload = JSON.parse(jsonPayload)
      return payload.id || payload.sub || null
    } catch (e) {
      return null
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error?.message || `HTTP ${res.status}`)
    }

    return res.json()
  }

  setAuthToken(token) {
    if (token) localStorage.setItem("auth_token", token)
  }

  getAuthToken() {
    return localStorage.getItem("auth_token")
  }

  clearAuth() {
    localStorage.removeItem("auth_token")
  }
}

// Create singleton instance pointing to the Vite-proxied /api
export const kyren = new KyrenClient("/api")
