-- =====================================================
-- KYREN 004: Sessions, Progress, Notes, Tutor, Recovery, Notifications
-- =====================================================

-- =====================================================
-- LEARNING SESSIONS
-- =====================================================
create table if not exists learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  session_type varchar(50) not null default 'course_learning', -- course_learning | tutoring | practice | assessment

  course_id uuid references courses (id) on delete set null,
  module_id uuid references course_modules (id) on delete set null,
  lesson_id uuid references lessons (id) on delete set null,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,

  videos_watched int not null default 0,
  quizzes_attempted int not null default 0,
  notes_created int not null default 0,
  ai_tutor_messages int not null default 0,

  completed boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user on learning_sessions (user_id);
create index if not exists idx_sessions_lesson on learning_sessions (lesson_id);
create index if not exists idx_sessions_started
  on learning_sessions (user_id, started_at desc);

-- =====================================================
-- COURSE PROGRESS
-- =====================================================
create table if not exists student_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,

  overall_completion_percentage numeric(5, 2) not null default 0,
  modules_completed int not null default 0,
  lessons_completed int not null default 0,

  average_quiz_score numeric(5, 2),
  total_time_spent_minutes int not null default 0,

  status varchar(30) not null default 'not_started', -- not_started | in_progress | completed | abandoned

  started_at timestamptz,
  completed_at timestamptz,
  last_accessed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, course_id)
);

create index if not exists idx_progress_user on student_progress (user_id);
create index if not exists idx_progress_course on student_progress (course_id);
create index if not exists idx_progress_status on student_progress (user_id, status);

drop trigger if exists trg_progress_updated_at on student_progress;
create trigger trg_progress_updated_at
  before update on student_progress
  for each row execute function set_updated_at();

-- tracks which individual lessons a student has finished
create table if not exists lesson_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  lesson_id uuid not null references lessons (id) on delete cascade,

  videos_watched int not null default 0,
  quiz_passed boolean not null default false,
  completed_at timestamptz not null default now(),

  unique (user_id, lesson_id)
);

create index if not exists idx_lesson_completions_user on lesson_completions (user_id);

-- =====================================================
-- NOTES
-- =====================================================
create table if not exists student_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  course_id uuid references courses (id) on delete cascade,
  module_id uuid references course_modules (id) on delete cascade,
  lesson_id uuid references lessons (id) on delete cascade,

  title varchar(255),
  content text not null,

  is_pinned boolean not null default false,
  is_public boolean not null default false,
  ai_generated boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notes_user on student_notes (user_id, updated_at desc);
create index if not exists idx_notes_lesson on student_notes (lesson_id);
create index if not exists idx_notes_pinned on student_notes (user_id, is_pinned);

drop trigger if exists trg_notes_updated_at on student_notes;
create trigger trg_notes_updated_at
  before update on student_notes
  for each row execute function set_updated_at();

-- =====================================================
-- AI TUTOR
-- =====================================================
create table if not exists ai_tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  lesson_id uuid references lessons (id) on delete set null,
  course_id uuid references courses (id) on delete set null,

  session_context jsonb,

  message_count int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,

  ai_model_used varchar(50),
  total_tokens_used int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_tutor_sessions_user
  on ai_tutor_sessions (user_id, started_at desc);
create index if not exists idx_tutor_sessions_lesson
  on ai_tutor_sessions (user_id, lesson_id);

create table if not exists ai_tutor_messages (
  id uuid primary key default gen_random_uuid(),
  tutor_session_id uuid not null references ai_tutor_sessions (id) on delete cascade,

  message_type varchar(20) not null, -- student_question | tutor_response | feedback
  content text not null,

  approach varchar(50), -- direct_explanation | socratic | example | analogy

  tokens_used int,
  processing_time_ms int,

  created_at timestamptz not null default now()
);

create index if not exists idx_tutor_msg_session
  on ai_tutor_messages (tutor_session_id, created_at);

-- =====================================================
-- RECOMMENDATIONS
-- =====================================================
create table if not exists learning_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  recommended_skill_id uuid references skills (id) on delete set null,
  recommended_course_id uuid references courses (id) on delete set null,

  recommendation_reason text,
  recommendation_type varchar(50), -- remedial | progression | exploration | strength_building

  personalization_factors jsonb,
  confidence_score numeric(5, 2),

  status varchar(30) not null default 'active', -- active | dismissed | accepted

  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists idx_recs_user on learning_recommendations (user_id, status);

-- =====================================================
-- ADAPTIVE RECOVERY
-- =====================================================
create table if not exists adaptive_recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  skill_id uuid references skills (id) on delete set null,

  triggered_reason text,
  original_mastery_score numeric(5, 2),

  recovery_strategy jsonb,

  status varchar(30) not null default 'active', -- active | completed | paused

  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_recovery_user
  on adaptive_recovery_sessions (user_id, status);
create index if not exists idx_recovery_skill on adaptive_recovery_sessions (skill_id);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  -- achievement | streak | task | course_ready | quiz_result | recovery | system
  notification_type varchar(50) not null default 'system',

  title varchar(255) not null,
  body text,
  -- in-app route to open when the notification is clicked
  link varchar(500),
  metadata jsonb,

  is_read boolean not null default false,
  read_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on notifications (user_id, is_read);
