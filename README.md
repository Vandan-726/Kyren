# Kyren Adaptive Learning OS

This repository contains the Kyren frontend (React + Vite) and backend (Node + Express) application.

## Prerequisites

1. Install dependencies: `npm install`
2. Configure local environment variables: copy `.env.example` to `.env` and add your credentials (e.g. Supabase, JWT Secrets, etc.).

## Running the Application Locally

To start both the Express API server and the Vite React frontend concurrently in development mode, run:

```bash
npm run dev
```

This command will:
- Spin up the backend API on port `3001` (with hot reloading enabled).
- Start the Vite development server on port `5173` with a proxy forwarding `/api` calls to the backend.

Open `http://localhost:5173` in your browser.

## Backend Commands

If you only want to run the backend API server:
```bash
npm run dev:api
```

## Production Build

To build the React frontend for production deployment:
```bash
npm run build
```
