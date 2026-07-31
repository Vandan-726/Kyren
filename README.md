# KYREN — Adaptive Vernacular STEM Learning OS

![Kyren Adaptive Learning](https://img.shields.io/badge/Status-Hackathon_Ready-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue) ![Version](https://img.shields.io/badge/Version-1.0.0-orange)

KYREN is not a generic LMS. It is not a basic AI chatbot or a simple course generator. **KYREN is a fully adaptive, vernacular STEM learning operating system.**

It is built specifically to translate and personalize STEM learning into interactive micro-modules that adjust to student learning gaps in real time. 

**The Core Product Loop:**
Talk → Understand → Detect Gaps → Build Dynamic Learning Tasks → Confirm Roadmap → Generate Course → Learn → Ask AI Tutor → Practice → Assess → Measure Mastery → Adapt → Recommend Next Skill

---

## ✨ Key Features & Differentiators

*   **Dynamic Learning Task Engine:** Continuously updates a student's learning roadmap in real-time as new learning gaps are detected. Tasks automatically reorder based on prerequisite constraints.
*   **Vernacular Learning (Voice-First):** Speak and interact in multiple Indian languages natively (Hindi, Gujarati, Tamil, etc.) powered by the Sarvam API.
*   **Adaptive Micro-Modules:** If a student fails a concept, KYREN goes a level deeper and automatically generates a bite-sized, simplified micro-module to address the specific misconception before returning to the main track.
*   **AI Course Generator & YouTube Curation Engine:** Automatically creates modular courses (Modules → Lessons → Quizzes) and curates high-quality, relevant YouTube videos prioritized by educational value and channel trust (e.g., Khan Academy, MIT).
*   **Lesson-Specific AI Tutors:** Context-aware tutors attached to every lesson that know the video content, lesson objectives, and the student’s past mistakes.
*   **Visual Knowledge Graph & Gap Radar:** See exactly what you know, what you're missing, and what prerequisites are blocking your goals.

---

## 🛠 Tech Stack

*   **Frontend:** React (Vite), Tailwind CSS, Framer Motion (for fluid animations), Shadcn UI.
*   **Backend:** Node.js, Express.js.
*   **Database:** Supabase (PostgreSQL) with advanced relational schema (users, courses, learning_tasks, mastery_scores, dependencies).
*   **AI Orchestration Engine:** Multi-agent backend architecture (Course Architect, Content Agent, Tutor Agent).
*   **Integrations:** 
    *   **Google Gemini / Groq:** Reasoning, Gap Analysis, Course Structure Generation.
    *   **Sarvam API:** Multilingual and voice interactions.
    *   **YouTube Data API v3:** Educational video curation and ranking.

---

## 🚀 Getting Started

### Prerequisites

1.  **Node.js** (v18+ recommended)
2.  **npm** or **yarn**
3.  **Supabase** project (for PostgreSQL database and Auth)
4.  API Keys for AI Integrations (Gemini, Sarvam, YouTube, etc.)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-repo/kyren.git
cd kyren
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory. You can use the provided `.env.example` as a reference. Ensure the following core variables are populated:

```ini
# Supabase Database Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# JWT & Auth
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30

# Application Ports
PORT=3001
NODE_ENV=development
PUBLIC_APP_URL=http://localhost:5173

# AI & API Integrations
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
SARVAM_API_KEY=your_sarvam_api_key
YOUTUBE_API_KEY=your_youtube_api_key

# Firebase (Required for Google Login)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

### 3. Running the Application Locally

KYREN uses a unified start script to spin up both the Vite frontend and the Express backend concurrently.

```bash
npm run dev
```

This command will:
- Start the **Express API Backend** on `http://localhost:3001` (with automatic hot-reloading).
- Start the **Vite React Frontend** on `http://localhost:5173`.
- Automatically proxy all `/api/*` network requests from the frontend to the backend.

Open `http://localhost:5173` in your browser to start the KYREN learning experience.

### 4. Running Backend Only (Optional)

If you wish to only run the API server (e.g., for testing or isolated debugging):

```bash
npm run dev:api
```

---

## 🏭 Production Deployment

To build the React application for production deployment (e.g., to Vercel, Netlify, or static hosting):

```bash
npm run build
```

For the backend, ensure `NODE_ENV=production` is set on your hosting provider (e.g., Render, Railway, AWS) and start the server using `npm start` (or `node server/index.js`).

---

## 🏆 Hackathon Notes: Why KYREN?

Traditional LMS platforms say: **Course → Student**  
Traditional AI chatbots say: **Question → Answer**

**KYREN says: Conversation → Learner Model → Dynamic Learning Graph → Personalized Course → Continuous Adaptation.**

The platform shifts the paradigm from standard syllabus delivery to dynamic, real-time curriculum generation, ensuring no student is left behind due to missing foundational knowledge.
