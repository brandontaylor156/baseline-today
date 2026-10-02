-- Phase B: tournaments and matches (public read, server write), plus private tables used only to
-- measure live-score lag during the provider trial. Idempotent.

create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  tour text not null check (tour in ('atp', 'wta')),
  provider text not null default 'balldontlie',
  provider_id bigint not null,
  name text not null,
  location text,
  surface text,
  category text,
  season integer,
  start_date date,
  end_date date,
  draw_size integer,
  updated_at timestamptz not null default now(),
  unique (provider, tour, provider_id)
);

create index if not exists tournaments_dates on public.tournaments (tour, start_date, end_date);

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  tour text not null check (tour in ('atp', 'wta')),
  provider text not null default 'balldontlie',
  provider_id bigint not null,
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  season integer,
  round text,
  player1_id bigint references public.players (id) on delete set null,
  player2_id bigint references public.players (id) on delete set null,
  winner_id bigint references public.players (id) on delete set null,
  -- Lifecycle from the provider's status_state: scheduled, in_progress, final, postponed, canceled,
  -- delayed, suspended, abandoned, unknown.
  status text not null default 'unknown',
  -- Provider's match_status, kept for walkover/retired/defaulted detail.
  result_detail text,
  is_live boolean not null default false,
  score text,
  set_scores jsonb not null default '[]'::jsonb,
  player1_game_score text,
  player2_game_score text,
  server text,
  scheduled_at timestamptz,
  not_before_text text,
  duration text,
  -- When the score (sets, games or points) last changed in our copy: used for staleness and lag.
  score_changed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, tour, provider_id)
);

create index if not exists matches_live on public.matches (tour) where is_live;
create index if not exists matches_tournament on public.matches (tournament_id, scheduled_at);
create index if not exists matches_scheduled on public.matches (scheduled_at);
create index if not exists matches_player1 on public.matches (player1_id, scheduled_at desc);
create index if not exists matches_player2 on public.matches (player2_id, scheduled_at desc);

alter table public.tournaments enable row level security;
alter table public.matches enable row level security;

revoke all on public.tournaments, public.matches from anon, authenticated;
grant select on public.tournaments, public.matches to anon, authenticated;

drop policy if exists "Tennis data is public" on public.tournaments;
create policy "Tennis data is public" on public.tournaments
  for select to anon, authenticated using (true);

drop policy if exists "Tennis data is public" on public.matches;
create policy "Tennis data is public" on public.matches
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Trial measurement (private: RLS on, no grants, no policies; server key only)
-- ---------------------------------------------------------------------------

-- One row per poll of a source, successful or not.
create table if not exists public.trial_polls (
  id bigint generated always as identity primary key,
  source text not null check (source in ('balldontlie', 'espn')),
  tour text not null check (tour in ('atp', 'wta')),
  polled_at timestamptz not null default now(),
  http_status integer,
  latency_ms integer,
  live_count integer,
  error text
);

-- One row each time a source shows a new state for a live singles match.
create table if not exists public.trial_observations (
  id bigint generated always as identity primary key,
  source text not null check (source in ('balldontlie', 'espn')),
  tour text not null check (tour in ('atp', 'wta')),
  match_key text not null,      -- source's own match id
  players_key text not null,    -- sorted normalized last names, to pair matches across sources
  games_state text not null,    -- e.g. "6-4 2-3" (comparable across sources)
  point_state text,             -- e.g. "30-15" (BALLDONTLIE only)
  status text,
  observed_at timestamptz not null default now()
);

create index if not exists trial_observations_lookup
  on public.trial_observations (source, tour, match_key, observed_at desc);

alter table public.trial_polls enable row level security;
alter table public.trial_observations enable row level security;
revoke all on public.trial_polls, public.trial_observations from anon, authenticated;
