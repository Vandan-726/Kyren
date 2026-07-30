-- =====================================================
-- KYREN 003: Courses, Modules, Lessons, Videos, Quizzes
-- =====================================================

-- =====================================================
-- COURSES
-- =====================================================
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),

  title varchar(255) not null,
  description text,

  skill_id uuid references skills (id) on delete set null,
  -- courses are AI-generated per student, so we track the owner and origin task
  user_id uuid references users (id) on delete cascade,
  task_id uuid references learning_tasks (id) on delete set null,

  difficulty_level varchar(20),
  estimated_duration_hours numeric(5, 2),

  generated_by_ai boolean not null default true,
  ai_model_used varchar(50),
  generation_prompt text,

  status varchar(30) not null default 'generated', -- draft | generated | approved | published
  approved_by uuid references users (id) on delete set null,
  approved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_skill on courses (skill_id);
create index if not exists idx_courses_status on courses (status);
create index if not exists idx_courses_user on courses (user_id, created_at desc);
create index if not exists idx_courses_task on courses (task_id);

drop trigger if exists trg_courses_updated_at on courses;
create trigger trg_courses_updated_at
  before update on courses
  for each row execute function set_updated_at();

-- =====================================================
-- MODULES
-- =====================================================
create table if not exists course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,

  module_number int not null default 1,
  title varchar(255) not null,
  objective text,

  estimated_duration_hours numeric(5, 2),
  mastery_threshold numeric(5, 2) not null default 80,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_modules_course
  on course_modules (course_id, module_number);

drop trigger if exists trg_modules_updated_at on course_modules;
create trigger trg_modules_updated_at
  before update on course_modules
  for each row execute function set_updated_at();

-- =====================================================
-- LESSONS
-- =====================================================
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references course_modules (id) on delete cascade,

  lesson_number int not null default 1,
  title varchar(255) not null,
  description text,

  learning_objective text,
  key_concepts text[] not null default '{}',
  -- AI-authored lesson body (markdown)
  content_markdown text,

  estimated_duration_minutes int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lessons_module on lessons (module_id, lesson_number);

drop trigger if exists trg_lessons_updated_at on lessons;
create trigger trg_lessons_updated_at
  before update on lessons
  for each row execute function set_updated_at();

-- =====================================================
-- VIDEO RESOURCES
-- =====================================================
create table if not exists lesson_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,

  video_number int not null default 1,
  title varchar(255) not null,
  description text,

  youtube_video_id varchar(100),
  youtube_url varchar(500),
  duration_seconds int,

  relevance_score numeric(5, 2),
  educational_quality_score numeric(5, 2),
  channel_name varchar(255),
  channel_trust_score numeric(5, 2),

  language varchar(20) not null default 'en',

  ai_summary text,
  key_takeaways text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists idx_videos_lesson on lesson_videos (lesson_id, video_number);
create index if not exists idx_videos_youtube on lesson_videos (youtube_video_id);

-- =====================================================
-- QUIZZES
-- =====================================================
create table if not exists lesson_quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,

  quiz_type varchar(30) not null default 'formative', -- formative | summative | adaptive
  title varchar(255),
  description text,

  passing_score numeric(5, 2) not null default 70,
  time_limit_minutes int,
  randomize_questions boolean not null default false,

  generated_by_ai boolean not null default true,
  ai_model_used varchar(50),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quizzes_lesson on lesson_quizzes (lesson_id);
create index if not exists idx_quizzes_type on lesson_quizzes (quiz_type);

drop trigger if exists trg_quizzes_updated_at on lesson_quizzes;
create trigger trg_quizzes_updated_at
  before update on lesson_quizzes
  for each row execute function set_updated_at();

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references lesson_quizzes (id) on delete cascade,

  question_number int not null default 1,
  question_text text not null,
  question_type varchar(30) not null default 'multiple_choice', -- multiple_choice | short_answer | true_false | essay

  difficulty_level varchar(20),
  bloom_level varchar(30), -- remember | understand | apply | analyze | evaluate | create

  options jsonb,                  -- {"A": "...", "B": "..."}
  correct_answer varchar(500),
  explanation text,

  created_at timestamptz not null default now()
);

create index if not exists idx_questions_quiz on quiz_questions (quiz_id, question_number);

-- =====================================================
-- ATTEMPTS & RESPONSES
-- =====================================================
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references lesson_quizzes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,

  attempt_number int not null default 1,
  score numeric(5, 2),
  passed boolean,
  time_spent_seconds int,

  correct_answers int,
  total_questions int,
  accuracy_percentage numeric(5, 2),

  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists idx_attempts_user on quiz_attempts (user_id);
create index if not exists idx_attempts_quiz on quiz_attempts (quiz_id);
create index if not exists idx_attempts_user_quiz
  on quiz_attempts (user_id, quiz_id, attempt_number desc);
create index if not exists idx_attempts_submitted
  on quiz_attempts (user_id, submitted_at desc);

create table if not exists quiz_responses (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id uuid not null references quiz_questions (id) on delete cascade,

  user_answer varchar(500),
  is_correct boolean,
  time_spent_seconds int,

  created_at timestamptz not null default now()
);

create index if not exists idx_responses_attempt on quiz_responses (quiz_attempt_id);
create index if not exists idx_responses_question on quiz_responses (question_id);
