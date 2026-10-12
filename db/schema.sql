-- WADIA · Lights & Automation: database schema (PostgreSQL / Supabase).
-- Apply with:  npm run db:migrate     (reads POSTGRES_URL / DATABASE_URL)
-- Idempotent: safe to run repeatedly.

create extension if not exists pgcrypto;

-- ───────────────────────── catalogue ─────────────────────────
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null check (char_length(name) between 1 and 160),
  category    text not null check (category in ('pendant', 'sconce', 'table', 'floor', 'ceiling')),
  description text not null check (char_length(description) between 1 and 1000),
  is_demo     boolean not null default true,        -- demonstration content: no real specs or prices implied
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  -- full-text search vector kept in sync by Postgres itself
  search      tsvector generated always as (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))) stored
);

-- listing: filter by category, ordered by sort then recency
create index if not exists products_category_sort_idx on products (category, sort, created_at desc);
create index if not exists products_sort_idx on products (sort, created_at desc);
-- search: GIN on the tsvector
create index if not exists products_search_idx on products using gin (search);

-- ───────────────────────── customer enquiries ─────────────────────────
create table if not exists inquiries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) between 5 and 254),
  phone        text check (phone is null or char_length(phone) <= 40),
  message      text not null check (char_length(message) between 5 and 4000),
  room         text check (room is null or char_length(room) <= 60),
  product_slug text references products (slug) on delete set null,
  plan         jsonb,                                -- the lighting plan attached from the planner, if any
  ip_hash      text,                                 -- salted hash, never the raw address
  status       text not null default 'new' check (status in ('new', 'read', 'replied', 'closed')),
  created_at   timestamptz not null default now()
);
create index if not exists inquiries_created_idx on inquiries (created_at desc);
create index if not exists inquiries_status_created_idx on inquiries (status, created_at desc);
create index if not exists inquiries_email_idx on inquiries (lower(email));

-- ───────────────────────── newsletter ─────────────────────────
create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (char_length(email) between 5 and 254),
  created_at timestamptz not null default now()
);
create unique index if not exists subscribers_email_uq on subscribers (lower(email));

-- ───────────────────────── security ─────────────────────────
-- Row Level Security on, with no policies: the public (anon) key can read and write nothing.
-- All access goes through the API, which connects with the server-side database role.
alter table products    enable row level security;
alter table inquiries   enable row level security;
alter table subscribers enable row level security;
