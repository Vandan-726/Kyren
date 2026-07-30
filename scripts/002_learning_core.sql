-- =====================================================
-- KYREN 002: Skills, Mastery, Conversations, Gaps, Tasks
-- =====================================================

-- =====================================================
-- SKILLS GRAPH
-- =====================================================
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),

  skill_code varchar(100) unique not null,   -- 'c_functions', 'dsa_arrays'
  skill_name varchar(255) not null,
  skill_category varchar(100),               -- programming | math | dsa

  description text,
  difficulty_level varchar(20),              -- beginner | intermediate | advanced

  -- Prerequisites are stored as skill_codes so the graph can be seeded
  -- and reasoned about without resolving UUIDs first.
  prerequisite_skill_codes text[] not null default '{}',
  estimated_learning_hours numeric(5, 2),

  created_at timestamptz not null default now()
);

create index if not exists idx_skills_category on skills (skill_category);
create index if not exists idx_skills_difficulty on skills (difficulty_level);

-- =====================================================
-- STUDENT SKILL MASTERY
-- =====================================================
create table if not exists student_skill_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,

  mastery_percentage numeric(5, 2) not null default 0,
  mastery_level varchar(20) not null default 'unlocked', -- unlocked | learning | proficient | mastered

  quiz_attempts int not null default 0,
  quiz_passed int not null default 0,
  average_quiz_score numeric(5, 2),

  last_attempted_at timestamptz,
  mastered_at timestamptz,

  is_active boolean not null default false,
  is_locked boolean not null default true,
  unlock_reason varchar(100), -- prerequisite_met | user_request | system_recommendation

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, skill_id)
);

create index if not exists idx_mastery_user on student_skill_mastery (user_id);
create index if not exists idx_mastery_level on student_skill_mastery (mastery_level);
create index if not exists idx_mastery_active on student_skill_mastery (user_id, is_active);

drop trigger if exists trg_mastery_updated_at on student_skill_mastery;
create trigger trg_mastery_updated_at
  before update on student_skill_mastery
  for each row execute function set_updated_at();

create table if not exists skill_mastery_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,

  mastery_score numeric(5, 2),
  quiz_score numeric(5, 2),

  recorded_at timestamptz not null default now()
);

create index if not exists idx_mastery_hist_user on skill_mastery_history (user_id);
create index if not exists idx_mastery_hist_skill on skill_mastery_history (skill_id);
create index if not exists idx_mastery_hist_recorded
  on skill_mastery_history (user_id, recorded_at desc);

-- =====================================================
-- AI CONVERSATIONS
-- =====================================================
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  conversation_type varchar(50) not null default 'discovery', -- discovery | doubt_solver | tutoring | general
  subject_area varchar(100),

  title varchar(255),
  summary text,

  -- discovery flow state: active | analyzing | completed
  status varchar(30) not null default 'active',

  message_count int not null default 0,
  duration_minutes int,
  ai_model_used varchar(50),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_conv_user on ai_conversations (user_id);
create index if not exists idx_conv_type on ai_conversations (conversation_type);
create index if not exists idx_conv_created on ai_conversations (user_id, created_at desc);

drop trigger if exists trg_conv_updated_at on ai_conversations;
create trigger trg_conv_updated_at
  before update on ai_conversations
  for each row execute function set_updated_at();

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations (id) on delete cascade,

  message_type varchar(20) not null, -- user | assistant
  content text not null,
  language varchar(20),

  audio_url varchar(500),
  audio_duration_seconds int,

  tokens_used int,
  processing_time_ms int,
  model_used varchar(50),

  created_at timestamptz not null default now()
);

create index if not exists idx_conv_msg_conversation
  on conversation_messages (conversation_id, created_at);
create index if not exists idx_conv_msg_type on conversation_messages (message_type);

-- =====================================================
-- LEARNING GAPS
-- =====================================================
create table if not exists learning_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  gap_title varchar(255) not null,
  skill_area varchar(100),
  skill_id uuid references skills (id) on delete set null,

  severity varchar(20) not null default 'medium', -- critical | high | medium | low
  confidence_score numeric(5, 2),

  detected_from varchar(50), -- conversation | quiz_failure | assessment
  detected_at timestamptz not null default now(),
  related_conversation_id uuid references ai_conversations (id) on delete set null,

  status varchar(30) not null default 'detected', -- detected | confirmed | dismissed | task_created | resolved
  resolved_at timestamptz,

  prerequisite_skills text[] not null default '{}',
  depends_on_skills text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gaps_user on learning_gaps (user_id);
create index if not exists idx_gaps_user_status on learning_gaps (user_id, status);
create index if not exists idx_gaps_skill_area on learning_gaps (skill_area);
create index if not exists idx_gaps_severity on learning_gaps (severity);

drop trigger if exists trg_gaps_updated_at on learning_gaps;
create trigger trg_gaps_updated_at
  before update on learning_gaps
  for each row execute function set_updated_at();

-- =====================================================
-- LEARNING TASKS (dynamic task engine)
-- =====================================================
create table if not exists learning_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  task_title varchar(255) not null,
  task_description text,
  skill_id uuid references skills (id) on delete set null,
  gap_id uuid references learning_gaps (id) on delete set null,

  priority_level int not null default 3, -- 1 highest .. 5 lowest
  difficulty varchar(20),
  estimated_duration_hours numeric(5, 2),

  -- ordering within the student's roadmap
  sequence_order int not null default 0,

  creation_reason text,
  detected_from varchar(50), -- conversation | gap_analysis | prerequisite
  confidence_score numeric(5, 2),

  -- detected | suggested | approved | in_progress | completed | mastered
  status varchar(30) not null default 'suggested',

  prerequisite_task_ids uuid[] not null default '{}',
  blocking_task_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_tasks_user on learning_tasks (user_id);
create index if not exists idx_tasks_user_status on learning_tasks (user_id, status);
create index if not exists idx_tasks_priority on learning_tasks (user_id, priority_level);
create index if not exists idx_tasks_sequence on learning_tasks (user_id, sequence_order);
create index if not exists idx_tasks_skill on learning_tasks (skill_id);

drop trigger if exists trg_tasks_updated_at on learning_tasks;
create trigger trg_tasks_updated_at
  before update on learning_tasks
  for each row execute function set_updated_at();

create table if not exists task_dependency_graph (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  source_task_id uuid not null references learning_tasks (id) on delete cascade,
  target_task_id uuid not null references learning_tasks (id) on delete cascade,

  dependency_type varchar(30) not null default 'prerequisite', -- prerequisite | related | recommended_after

  created_at timestamptz not null default now(),

  unique (source_task_id, target_task_id),
  constraint task_dep_no_self_edge check (source_task_id <> target_task_id)
);

create index if not exists idx_task_dep_source on task_dependency_graph (source_task_id);
create index if not exists idx_task_dep_target on task_dependency_graph (target_task_id);
create index if not exists idx_task_dep_user on task_dependency_graph (user_id);
