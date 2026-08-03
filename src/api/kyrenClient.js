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

  async __fetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    })
    if (res.status === 401) {
      localStorage.removeItem("auth_token")
      const path = window.location.pathname
      if (path !== "/login" && path !== "/register" && path !== "/forgot-password") {
        window.location.href = "/login"
      }
    }
    return res
  }

  async list(filter = {}, orderBy = null) {
    const query = new URLSearchParams()
    Object.entries(filter).forEach(([k, v]) => {
      if (v != null) query.append(k, v)
    })
    if (orderBy) query.append("orderBy", orderBy)

    const url = `${this.endpoint}?${query}`
    const res = await this.__fetch(url)
    if (!res.ok) throw new Error(`Failed to list ${this.endpoint}`)
    const payload = await res.json()
    if (payload) {
      if (payload.data !== undefined) return payload.data;
      if (payload.items !== undefined) return payload.items;
      if (payload.results !== undefined) return payload.results;
    }
    return payload;
  }

  async filter(filter = {}, orderBy = null) {
    return this.list(filter, orderBy)
  }

  async get(id) {
    const res = await this.__fetch(`${this.endpoint}/${id}`)
    if (!res.ok) throw new Error(`Failed to get ${this.endpoint}/${id}`)
    const payload = await res.json()
    if (payload) {
      if (payload.data !== undefined) return payload.data;
      if (payload.item !== undefined) return payload.item;
      if (payload.items !== undefined) return payload.items;
      if (payload.results !== undefined) return payload.results;
    }
    return payload;
  }

  async create(data) {
    const res = await this.__fetch(this.endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || "Failed to create")
    }
    const payload = await res.json()
    if (payload) {
      if (payload.data !== undefined) return payload.data;
      if (payload.item !== undefined) return payload.item;
      if (payload.items !== undefined) return payload.items;
      if (payload.results !== undefined) return payload.results;
    }
    return payload;
  }

  async update(id, data) {
    const res = await this.__fetch(`${this.endpoint}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`Failed to update ${this.endpoint}/${id}`)
    const payload = await res.json()
    return payload && payload.data !== undefined ? payload.data : payload
  }

  async bulkUpdate(items) {
    const results = []
    for (const item of items) {
      results.push(await this.update(item.id, item))
    }
    return results
  }

  async bulkCreate(items) {
    const results = []
    for (const item of items) {
      results.push(await this.create(item))
    }
    return results
  }

  async delete(id) {
    const res = await this.__fetch(`${this.endpoint}/${id}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error(`Failed to delete ${this.endpoint}/${id}`)
    const payload = await res.json().catch(() => ({}))
    return payload && payload.success && payload.data !== undefined ? payload.data : res.ok
  }

  subscribe(callback) {
    // Standard mock polling to simulate real-time database changes over HTTP
    const interval = setInterval(() => {
      callback()
    }, 5000)
    return () => clearInterval(interval)
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
      loginWithProvider: async (provider, returnTo) => {
        if (provider !== "google") {
          throw new Error("Only Google provider is supported");
        }
        
        const { auth, signInWithPopup, GoogleAuthProvider } = await import("@/lib/firebaseClient");
        if (!auth) {
          throw new Error(
            "Google sign-in is not configured. Please set the following variables in your .env file:\n" +
            "VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID"
          );
        }
        
        const providerInstance = new GoogleAuthProvider();
        providerInstance.setCustomParameters({ prompt: 'select_account' });
        
        let result;
        try {
          result = await signInWithPopup(auth, providerInstance);
        } catch (popupErr) {
          if (popupErr.code === 'auth/popup-blocked') {
            throw new Error("Google sign-in popup was blocked by browser. Please allow popups for this site.");
          } else if (popupErr.code === 'auth/popup-closed-by-user') {
            throw new Error("Sign-in process was cancelled.");
          }
          throw popupErr;
        }
        
        const idToken = await result.user.getIdToken();
        
        const data = await kyren.request("/auth/google", {
          method: "POST",
          body: JSON.stringify({ idToken }),
        });
        
        if (data.accessToken) {
          kyren.setAuthToken(data.accessToken);
        }
        
        window.location.href = returnTo || "/";
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
      resetPasswordRequest: async (email) => {
        const data = await this.request("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        if (data.token) {
          localStorage.setItem("dev_reset_token", data.token);
        }
        return data;
      },
      resetPassword: async ({ resetToken, newPassword }) => {
        return this.request("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, newPassword }),
        });
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
        const user = data.user || {}

        let profile = {}
        try {
          profile = await this.request("/users/me/profile", {
            headers,
          })
        } catch (err) {
          profile = {}
        }

        const mergedUser = { ...user, ...profile }
        const userId = mergedUser.id
        if (userId) {
          mergedUser.linked_student_ids = JSON.parse(localStorage.getItem(`linked_student_ids_${userId}`) || "[]")
          mergedUser.stem_interests = JSON.parse(localStorage.getItem(`stem_interests_${userId}`) || "[]")
          mergedUser.input_preference = JSON.parse(localStorage.getItem(`input_preference_${userId}`) || "null")
          mergedUser.current_skill_level = JSON.parse(localStorage.getItem(`current_skill_level_${userId}`) || "null")
        }
        return mergedUser
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

  async refreshSession() {
    const data = await this.request("/auth/refresh", {
      method: "POST",
      _retry: true,
    })

    if (data.accessToken) {
      this.setAuthToken(data.accessToken)
    }

    return data
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`
    const token = this.getAuthToken()
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      headers,
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const err = new Error(errorData.error?.message || `HTTP ${res.status}`)
      err.status = res.status
      err.payload = errorData

      const isRefreshable = res.status === 401 && endpoint !== "/auth/refresh" && !options._retry
      if (isRefreshable) {
        try {
          await this.refreshSession()
          return this.request(endpoint, { ...options, _retry: true })
        } catch (refreshError) {
          this.clearAuth()
          throw err
        }
      }

      if (res.status === 401) {
        this.clearAuth()
      }

      throw err
    }

    const payload = await res.json()
    return payload && payload.data !== undefined ? payload.data : payload
  }

  async requestFormData(endpoint, formData, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`
    const token = this.getAuthToken()
    const headers = { ...options.headers }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const res = await fetch(url, {
      ...options,
      method: options.method || "POST",
      body: formData,
      credentials: "include",
      headers,
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const err = new Error(errorData.error?.message || `HTTP ${res.status}`)
      err.status = res.status
      err.payload = errorData

      if (res.status === 401 && endpoint !== "/auth/refresh" && !options._retry) {
        try {
          await this.refreshSession()
          return this.requestFormData(endpoint, formData, { ...options, _retry: true })
        } catch (refreshError) {
          this.clearAuth()
          throw err
        }
      }

      if (res.status === 401) {
        this.clearAuth()
      }

      throw err
    }

    const payload = await res.json()
    return payload && payload.data !== undefined ? payload.data : payload
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
