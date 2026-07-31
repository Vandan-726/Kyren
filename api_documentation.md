# KYREN API Documentation

The KYREN backend is powered by Node.js and Express. It serves a RESTful API with intelligent routing to internal AI agents and a robust dynamic entity mapping system for standard CRUD operations over the Supabase database.

All endpoints are hosted under the `/api` prefix (e.g., `http://localhost:3001/api`).

---

## Base API Features

- **Content-Type**: All requests and responses are typically `application/json`.
- **Authentication**: JWT Bearer token-based auth. Refresh tokens use `HttpOnly` cookies.
- **Auto-Sandboxing**: Most `GET`, `POST`, and `PATCH` requests automatically inject or filter by the authenticated user's ID (`req.user.id`) to ensure data privacy.
- **Response Format**: Wrapped in a standard envelope.
  ```json
  // Success
  {
    "data": { ... } // or array
  }
  // Error
  {
    "error": {
      "code": "not_found",
      "message": "Resource not found"
    }
  }
  ```

---

## 1. Authentication Endpoints (`/api/auth`)

Manages user accounts, sessions, and OAuth flows.

- **`POST /api/auth/register`**  
  Registers a new user via Email and Password.  
  _Body:_ `{ "email": "user@example.com", "password": "...", "fullName": "..." }`

- **`POST /api/auth/login`**  
  Logs in a user and provisions an access token and an HttpOnly refresh cookie.  
  _Body:_ `{ "email": "user@example.com", "password": "..." }`

- **`POST /api/auth/google`**  
  Exchanges a Firebase Google Auth ID Token for a KYREN session.  
  _Body:_ `{ "idToken": "..." }`

- **`POST /api/auth/refresh`**  
  Renews the JWT access token using the stored `HttpOnly` cookie.

- **`POST /api/auth/logout`**  
  Revokes the current session. Accepts `{ "allDevices": true }` to revoke globally.

- **`GET /api/auth/me`**  
  Returns the currently authenticated user's standard metadata.

---

## 2. Dynamic Entity Endpoints (`/api/:entityName`)

KYREN uses an intelligent abstraction layer that automatically translates frontend Entity names (e.g., `LearningTask`, `Course`, `LearningGap`) to physical Supabase database tables (e.g., `learning_tasks`, `courses`, `learning_gaps`) via `server/routes/entityMappings.js`. 

This provides a unified CRUD API for almost the entire domain model.

- **`GET /api/:entityName`**  
  List or search entities. Supports query filters (e.g., `?status=In Progress&orderBy=-created_at`). Auto-sandboxes to the logged-in user unless the table is globally shared.

- **`GET /api/:entityName/:id`**  
  Retrieve a specific entity by its UUID.

- **`POST /api/:entityName`**  
  Create a new entity. The `user_id` is automatically populated in the backend for protected models (like `LearningTask`, `Course`, `MasteryScore`).

- **`PATCH /api/:entityName/:id`**  
  Update an entity. Payload mappings apply transparently (e.g., converting frontend's `difficulty` into backend's `difficulty_level`).

- **`DELETE /api/:entityName/:id`**  
  Delete an entity permanently.

### Common Entities Include:
`User`, `Course`, `Module`, `Lesson`, `LearningTask`, `LearningGap`, `MasteryScore`, `Message`, `Conversation`.

---

## 3. AI Orchestration (`/api/orchestrate`)

The central command center for AI operations.

- **`POST /api/orchestrate`**  
  Submit a typed request to the orchestration engine. The engine determines the required AI agent (Gemini, Groq, Sarvam) and context to load.  
  _Body:_
  ```json
  {
    "requestType": "quiz_generation",
    "params": {
      "lessonId": "uuid-...",
      "difficulty": "intermediate"
    }
  }
  ```

- **`GET /api/orchestrate/usage`**  
  Returns the logged-in user's AI token usage, costs, and request counts over the past N days.

- **`GET /api/orchestrate/types`**  
  Lists all available request types recognized by the orchestration engine.

---

## 4. AI Agents Direct Trigger (`/api/agents/:agentName`)

Used for triggering specific stateless agents or backend generation functions.

- **`POST /api/agents/:agentName`**  
  Dynamically loads and invokes an internal service function (e.g., `generateCourseStructure`, `solveDoubt`).  
  _Body:_ Agent-specific parameters (e.g., `{ "taskId": "...", "userGoal": "..." }`)

---

## 5. Domain-Specific Routes

Certain domains have dedicated custom logic outside of standard CRUD.

- **`/api/learning/gaps`**  
  Analyzes conversation messages to detect and extract learning gaps.
- **`/api/progress/mastery`**  
  Aggregates quiz results to output learning velocity and calculate mastery percentages.
- **`/api/voice/process`**  
  Takes spoken audio blobs, leverages Sarvam/NVIDIA APIs for speech-to-text, maps intent, and responds dynamically.

---

## 6. System & Health

- **`GET /api/health`**  
  Returns the server's uptime, database connection status, and basic system health. Used for uptime monitoring and deployment checks.

---

### Security Notes
*   All routes expect a valid JSON Web Token via the `Authorization: Bearer <token>` header, except for public endpoints like `/api/auth/login`.
*   Direct API interaction from a browser client without the `kyrenClient` wrapper requires manually appending the token and formatting queries per `EntityProxy` definitions.
