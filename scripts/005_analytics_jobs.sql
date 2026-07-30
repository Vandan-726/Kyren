-- =====================================================
-- KYREN 005: Analytics, Gamification, AI Usage, Job Queue
-- =====================================================

-- =====================================================
-- ANALYTICS
-- =====================================================
create table if not exists user_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  metric_type varchar(50) not null, -- daily_active | weekly_active | monthly_active | minutes_learned
  metric_value int not null default 0,

  recorded_date date not null default current_date,

  unique (user_id, metric_type, recorded_date)
);

create index if not exists idx_analytics_user on user_analytics (user_id);
create index if not exists idx_analytics_type_date
  on user_analytics (metric_type, recorded_date desc);

create table if not exists learning_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users (id) on delete cascade,

  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,

  last_learning_date date,
  streak_started_date date,

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_streaks_updated_at on learning_streaks;
create trigger trg_streaks_updated_at
  before update on learning_streaks
  for each row execute function set_updated_at();

-- =====================================================
-- AI USAGE & MODEL PERFORMANCE
-- =====================================================
create table if not exists ai_api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,

  api_provider varchar(50) not null,  -- xai | sarvam
  api_endpoint varchar(255),
  model varchar(100),

  request_type varchar(50),            -- gap_analysis | course_generation | speech_to_text ...

  prompt_tokens int,
  completion_tokens int,
  tokens_used int,
  cost_estimate numeric(10, 6),

  request_status varchar(20) not null default 'success', -- success | failed | timeout
  error_message text,

  processing_time_ms int,

  created_at timestamptz not null default now()
);

create index if not exists idx_usage_user on ai_api_usage (user_id, created_at desc);
create index if not exists idx_usage_provider on ai_api_usage (api_provider, created_at desc);
create index if not exists idx_usage_type on ai_api_usage (request_type);

create table if not exists ai_model_performance (
  id uuid primary key default gen_random_uuid(),
  model_name varchar(100) not null,
  model_version varchar(50),

  avg_response_time_ms numeric(10, 2),
  success_rate numeric(5, 2),
  error_rate numeric(5, 2),

  total_requests int not null default 0,
  total_tokens_used int not null default 0,

  recorded_at timestamptz not null default now()
);

create index if not exists idx_model_perf_name
  on ai_model_performance (model_name, recorded_at desc);

-- =====================================================
-- GAMIFICATION
-- =====================================================
create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  achievement_type varchar(100) not null, -- skill_mastery | course_completion | learning_streak
  achievement_name varchar(255) not null,
  description text,

  earned_at timestamptz not null default now(),

  -- an achievement of a given name is only ever awarded once per user
  unique (user_id, achievement_name)
);

create index if not exists idx_achievements_user
  on user_achievements (user_id, earned_at desc);
create index if not exists idx_achievements_type on user_achievements (achievement_type);

create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  badge_code varchar(100) not null,
  badge_name varchar(255) not null,
  badge_description text,
  badge_icon_url varchar(500),

  earned_at timestamptz not null default now(),

  unique (user_id, badge_code)
);

create index if not exists idx_badges_user on user_badges (user_id, earned_at desc);

-- =====================================================
-- GENERATION JOB QUEUE (replaces Redis/Bull)
-- =====================================================
create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,

  -- generate_course | generate_roadmap | generate_quiz | analyze_gaps | weekly_summary
  type varchar(50) not null,
  status varchar(20) not null default 'queued', -- queued | running | succeeded | failed

  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,

  attempts int not null default 0,
  max_attempts int not null default 3,
  -- earliest time this job may be claimed (used for retry backoff)
  run_after timestamptz not null default now(),

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- the claim query filters on status + run_after and orders by created_at
create index if not exists idx_jobs_claim
  on generation_jobs (status, run_after, created_at);
create index if not exists idx_jobs_user on generation_jobs (user_id, created_at desc);
create index if not exists idx_jobs_type on generation_jobs (type, status);

-- =====================================================
-- Atomically claim the next runnable job.
-- FOR UPDATE SKIP LOCKED lets multiple workers drain the queue
-- concurrently without ever handing the same job to two of them.
-- =====================================================
create or replace function claim_next_job()
returns generation_jobs
language plpgsql
as $$
declare
  claimed generation_jobs;
begin
  select * into claimed
  from generation_jobs
  where status = 'queued'
    and run_after <= now()
    and attempts < max_attempts
  order by created_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update generation_jobs
  set status = 'running',
      started_at = now(),
      attempts = attempts + 1
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;
