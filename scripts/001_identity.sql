-- =====================================================
-- KYREN 001: Identity, Auth & Admin
-- =====================================================
-- RLS is intentionally NOT enabled. The Express API holds the
-- Supabase service-role key and is the sole gatekeeper; all
-- authorization is enforced in server middleware.

create extension if not exists "pgcrypto";

-- =====================================================
-- USERS
-- =====================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,

  -- nullable: Google-only accounts never set a password
  password_hash varchar(255),
  -- set when the account is linked to a Firebase (Google) identity
  firebase_uid varchar(128) unique,

  first_name varchar(100),
  last_name varchar(100),
  phone varchar(20),
  avatar_url varchar(500),

  -- 'student' | 'parent' | 'teacher' | 'admin'
  role varchar(20) not null default 'student',

  onboarding_completed boolean not null default false,
  is_active boolean not null default true,
  is_verified boolean not null default false,

  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_auth_method_check
    check (password_hash is not null or firebase_uid is not null)
);

create index if not exists idx_users_email on users (lower(email));
create index if not exists idx_users_firebase_uid on users (firebase_uid);
create index if not exists idx_users_role on users (role);
create index if not exists idx_users_created_at on users (created_at desc);

-- =====================================================
-- AUTH SESSIONS (refresh token rotation)
-- =====================================================
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  -- sha256 of the opaque refresh token; the raw token is never stored
  refresh_token_hash varchar(128) not null,

  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- set when this session is rotated, pointing at its replacement
  replaced_by uuid references auth_sessions (id) on delete set null,

  ip_address varchar(64),
  user_agent varchar(500),

  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);

create index if not exists idx_auth_sessions_user_id on auth_sessions (user_id);
create unique index if not exists idx_auth_sessions_token
  on auth_sessions (refresh_token_hash);
create index if not exists idx_auth_sessions_expires_at on auth_sessions (expires_at);

-- =====================================================
-- PASSWORD RESET TOKENS (single use)
-- =====================================================
create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,

  token_hash varchar(128) not null,
  expires_at timestamptz not null,
  used_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists idx_password_reset_token
  on password_reset_tokens (token_hash);
create index if not exists idx_password_reset_user on password_reset_tokens (user_id);

-- =====================================================
-- STUDENT PROFILES
-- =====================================================
create table if not exists student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users (id) on delete cascade,

  -- Preferences
  preferred_language varchar(20) not null default 'en',
  communication_mode varchar(20) not null default 'text', -- text | voice | mixed
  education_level varchar(50),                            -- high_school | undergraduate | graduate

  -- Learning profile
  learning_goal varchar(500),
  learning_pace varchar(20),   -- slow | medium | fast
  learning_style varchar(50),  -- visual | auditory | kinesthetic | reading

  -- Guardian / institution linkage
  parent_email varchar(255),
  institution_code varchar(100),

  -- Metadata
  country varchar(100),
  timezone varchar(50) not null default 'UTC',
  profile_completeness numeric(5, 2) not null default 0,

  last_learning_session timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_profiles_user on student_profiles (user_id);
create index if not exists idx_student_profiles_language
  on student_profiles (preferred_language);
create index if not exists idx_student_profiles_parent_email
  on student_profiles (lower(parent_email));
create index if not exists idx_student_profiles_institution
  on student_profiles (institution_code);

-- =====================================================
-- ADMIN
-- =====================================================
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users (id) on delete cascade,

  -- super_admin | content_moderator | analytics | support
  role varchar(50) not null default 'support',

  created_at timestamptz not null default now()
);

create index if not exists idx_admin_users_role on admin_users (role);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users (id) on delete set null,

  action varchar(100) not null,
  resource_type varchar(50),
  resource_id varchar(100),
  changes jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_audit_admin on admin_audit_logs (admin_user_id);
create index if not exists idx_audit_action on admin_audit_logs (action);
create index if not exists idx_audit_created_at on admin_audit_logs (created_at desc);

-- =====================================================
-- updated_at trigger, shared by every table that has the column
-- =====================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_student_profiles_updated_at on student_profiles;
create trigger trg_student_profiles_updated_at
  before update on student_profiles
  for each row execute function set_updated_at();
