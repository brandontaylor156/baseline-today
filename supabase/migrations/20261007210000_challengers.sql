-- ATP Challenger Tour results from Wikipedia draw pages (CC BY-SA 4.0), kept apart from the tour
-- results the rest of the site uses. They feed the breakthrough forecaster.

create table if not exists public.challenger_events (
  id bigserial primary key,
  season integer not null,
  draw_title text not null unique,
  article text,
  name text not null,
  start_date date,
  end_date date,
  surface text,
  location text,
  matches integer not null default 0,
  checked_at timestamptz not null default now()
);

create table if not exists public.challenger_matches (
  id bigserial primary key,
  event_id bigint not null references public.challenger_events (id) on delete cascade,
  round text,
  round_rank integer not null,
  player1_name text not null,
  player2_name text not null,
  player1_country text,
  player2_country text,
  winner_side smallint check (winner_side in (1, 2)),
  set_scores jsonb not null default '[]',
  result_detail text,
  unique (event_id, round, player1_name, player2_name)
);
create index if not exists challenger_matches_event on public.challenger_matches (event_id);

alter table public.challenger_events enable row level security;
alter table public.challenger_matches enable row level security;
drop policy if exists "challenger_events readable" on public.challenger_events;
create policy "challenger_events readable" on public.challenger_events for select to anon, authenticated using (true);
drop policy if exists "challenger_matches readable" on public.challenger_matches;
create policy "challenger_matches readable" on public.challenger_matches for select to anon, authenticated using (true);

-- Junior Grand Slam singles draws live here too: 'challenger', 'junior-boys' or 'junior-girls'.
alter table public.challenger_events add column if not exists circuit text not null default 'challenger';
create index if not exists challenger_events_circuit on public.challenger_events (circuit, season);
