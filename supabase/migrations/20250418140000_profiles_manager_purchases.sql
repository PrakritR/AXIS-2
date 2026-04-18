-- Run in Supabase SQL editor or via CLI. Adjust schema name if needed.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('resident', 'manager', 'owner', 'admin')),
  manager_id text unique,
  full_name text,
  application_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles for select using (auth.uid() = id);

create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

-- Paid manager checkout (written by service role + read for signup completion)
create table if not exists public.manager_purchases (
  id uuid primary key default gen_random_uuid (),
  email text not null,
  stripe_checkout_session_id text unique not null,
  stripe_customer_id text,
  manager_id text unique not null,
  tier text,
  billing text,
  promo_code text,
  paid_at timestamptz not null default now (),
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists manager_purchases_email_lower_idx on public.manager_purchases (lower(email));

alter table public.manager_purchases enable row level security;

-- No client access; service role bypasses RLS
