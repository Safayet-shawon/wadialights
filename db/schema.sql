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

-- ───────────────────────── shop: pricing, stock, images ─────────────────────────
alter table products add column if not exists price_bdt integer check (price_bdt is null or price_bdt >= 0);   -- null = "price on request"
alter table products add column if not exists stock    integer check (stock is null or stock >= 0);            -- null = made to order / not tracked
alter table products add column if not exists images   text[] not null default '{}';
alter table products add column if not exists active   boolean not null default true;
alter table products add column if not exists featured boolean not null default false;
create index if not exists products_active_idx on products (active, category, sort);

-- ───────────────────────── orders ─────────────────────────
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                                   -- customer-facing, e.g. WD-7K2M9Q
  token_hash     text not null,                                          -- sha-256 of the private tracking token
  customer_name  text not null check (char_length(customer_name) between 1 and 120),
  phone          text not null check (char_length(phone) between 6 and 20),
  email          text check (email is null or char_length(email) <= 254),
  address        text not null check (char_length(address) between 5 and 400),
  area           text check (area is null or char_length(area) <= 80),
  city           text not null check (char_length(city) between 1 and 80),
  notes          text check (notes is null or char_length(notes) <= 1000),
  payment_method text not null default 'cod' check (payment_method in ('cod', 'arrange')),
  items          jsonb not null,                                         -- snapshot: slug, name, qty, unit price at order time
  subtotal_bdt   integer,                                                -- null when any item is "price on request"
  status         text not null default 'received' check (status in ('received', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  admin_note     text,
  ip_hash        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_status_created_idx on orders (status, created_at desc);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_phone_idx on orders (phone);
alter table orders enable row level security;
