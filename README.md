# KYREN — Adaptive Vernacular STEM Learning Operating System

[![Status](https://img.shields.io/badge/Status-Production_Ready-brightgreen)](#) [![License](https://img.shields.io/badge/License-MIT-blue)](#) [![Version](https://img.shields.io/badge/Version-1.0.0-orange)](#)

KYREN is an adaptive, voice-first STEM learning operating system designed to personalize technical education in real time. Unlike static LMS platforms or generic conversational bots, KYREN dynamically builds custom learning graphs, identifies conceptual gaps, generates micro-modules, and continuously recalibrates curricula based on student mastery data.

## System Architecture & Core Loop

KYREN operates on an asynchronous multi-agent orchestration architecture:

`Conversation / Speech Input -> Knowledge Graph Evaluation -> Gap Detection Engine -> Dynamic Dependency Graph -> Modular Course Generation -> Contextual AI Tutoring -> Continuous Mastery Calibration`

### Key Capabilities

* **Dynamic Dependency & Gap Engine**: Real-time evaluation of prerequisite constraints and knowledge gaps. Adjusts learning roadmaps dynamically as student mastery fluctuates.
* **Multilingual & Voice Interface**: Native multilingual interaction (Hindi, Gujarati, Tamil, Telugu, etc.) powered by Sarvam AI voice models.
* **Adaptive Micro-Module Generation**: Automatically detects missing prerequisite concepts and constructs targeted, bite-sized remedial modules before restoring the student to their primary learning track.
* **Curriculum & Video Ranking Engine**: Programmatically generates structured course modules (Lessons, Objectives, Assessments) paired with educational YouTube content ranked by trust metrics and domain relevance.
* **Lesson-Scoped Socratic AI Tutors**: Context-aware AI agents attached to individual lessons, equipped with video summaries, specific lesson objectives, and student error history.
* **Visual Knowledge Graph**: Interactive visual representation of concept dependencies, prerequisite blocks, and mastery vectors.

---

## Technical Stack

* **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion, Radix UI.
* **Backend Runtime**: Node.js ES Modules, Express.js.
* **Deployment & Serverless**: Native Vercel Serverless Function entry point (`/api/index.js`), with scheduled Vercel Cron background worker draining.
* **Database & Security**: Supabase (PostgreSQL) with relational identity, course, streak, and mastery schemas; JWT-based access/refresh token rotation.
* **AI Orchestration Layer**: Multi-agent orchestration engine supporting Google Gemini, Groq, Sarvam AI (Voice), and YouTube Data API v3.

---

## Getting Started

### Prerequisites

* Node.js (v18.0.0 or higher)
* npm, yarn, or pnpm
* Supabase PostgreSQL instance
* API credentials for Google Gemini, Sarvam AI, and YouTube Data API v3

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Vandan-726/Kyren.git
cd Kyren
npm install
```

### Environment Configuration

Create a `.env` file in the root directory:

```ini
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# JWT Security
JWT_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30

# System Settings
PORT=3001
NODE_ENV=development
PUBLIC_APP_URL=http://localhost:5173
CRON_SECRET=your_cron_secret

# AI & Media Services
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
SARVAM_API_KEY=your_sarvam_api_key
YOUTUBE_API_KEY=your_youtube_api_key

# Firebase Authentication (Optional)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### Development Server

Run both the Vite frontend dev server and Express API backend concurrently:

```bash
npm run dev
```

* **Frontend**: `http://localhost:5173`
* **API Server**: `http://localhost:3001` (automatically proxied via Vite)

To run the API server independently:

```bash
npm run dev:api
```

---

## Production Deployment

### Building for Production

Compile static assets and verify build integrity:

```bash
npm run build
```

### Vercel Deployment

KYREN is pre-configured for one-click serverless deployment on Vercel:

1. Push your repository to GitHub.
2. Import the project into Vercel (Framework preset: **Vite**).
3. Set the Environment Variables listed above in Vercel Project Settings.
4. Deploy. Vercel automatically handles frontend SPA routing and binds `/api/index.js` as an Express serverless endpoint.

---

## License

MIT License.
