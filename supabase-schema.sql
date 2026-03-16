-- ============================================================
-- Two Truths and a Lie - Supabase SQL Schema
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── players ────────────────────────────────────────────────
create table if not exists players (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  score      integer not null default 0,
  joined_at  timestamptz not null default now()
);

-- ─── questions ──────────────────────────────────────────────
create table if not exists questions (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid references players(id) on delete cascade,
  statement_1 text not null,
  statement_2 text not null,
  statement_3 text not null,
  lie_index   integer not null check (lie_index in (0, 1, 2)),
  status      text not null default 'pending'
              check (status in ('pending', 'active', 'completed')),
  created_at  timestamptz not null default now()
);

-- ─── votes ──────────────────────────────────────────────────
create table if not exists votes (
  id             uuid primary key default uuid_generate_v4(),
  player_id      uuid references players(id) on delete cascade,
  question_id    uuid references questions(id) on delete cascade,
  selected_index integer not null check (selected_index in (0, 1, 2)),
  created_at     timestamptz not null default now(),
  -- Each player can only vote once per question
  unique (player_id, question_id)
);

-- ─── game_state ─────────────────────────────────────────────
create table if not exists game_state (
  id                  integer primary key,
  current_question_id uuid references questions(id) on delete set null,
  status              text not null default 'waiting'
                      check (status in ('waiting', 'voting', 'revealed'))
);

-- Seed the single game_state row (only runs if the row doesn't exist)
insert into game_state (id, current_question_id, status)
values (1, null, 'waiting')
on conflict (id) do nothing;

-- ─── Row Level Security ─────────────────────────────────────
-- Allow all operations for now (for simplicity in party game context)
alter table players    enable row level security;
alter table questions  enable row level security;
alter table votes      enable row level security;
alter table game_state enable row level security;

-- Public read/write policies
create policy "Allow all on players"    on players    for all using (true) with check (true);
create policy "Allow all on questions"  on questions  for all using (true) with check (true);
create policy "Allow all on votes"      on votes      for all using (true) with check (true);
create policy "Allow all on game_state" on game_state for all using (true) with check (true);

-- ─── Realtime ───────────────────────────────────────────────
-- Enable realtime on all tables
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table questions;
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table game_state;
