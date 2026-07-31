-- Migration: Create missing tables and columns for Kyren entities
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code VARCHAR(50) UNIQUE NOT NULL,
    student_ids UUID[] NOT NULL DEFAULT '{}',
    created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id);

-- 2. Flashcards table
CREATE TABLE IF NOT EXISTS flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    skill_id VARCHAR(100),
    skill_name VARCHAR(255),
    concept TEXT,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards(lesson_id);

-- 3. Spaced Reviews table
CREATE TABLE IF NOT EXISTS spaced_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    next_review_date VARCHAR(50) NOT NULL,
    ease_factor NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
    interval_days INT NOT NULL DEFAULT 0,
    repetitions INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spaced_reviews_user ON spaced_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_spaced_reviews_date ON spaced_reviews(user_id, next_review_date);

-- 4. Micro Modules table
CREATE TABLE IF NOT EXISTS micro_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    skill_name VARCHAR(255),
    trigger_reason TEXT,
    title VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    analogy TEXT,
    example TEXT,
    interactive_question TEXT,
    mini_quiz_question TEXT,
    mini_quiz_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    mini_quiz_answer TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'generated',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_micro_modules_user ON micro_modules(user_id);

-- 5. Task Activity Logs table
CREATE TABLE IF NOT EXISTS task_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES learning_tasks(id) ON DELETE SET NULL,
    task_title VARCHAR(255),
    event_type VARCHAR(50),
    before_state TEXT,
    after_state TEXT,
    message TEXT,
    created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_logs_user ON task_activity_logs(user_id);

-- 6. Add missing columns to existing tables
ALTER TABLE learning_gaps ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS linked_gap_ids UUID[];
