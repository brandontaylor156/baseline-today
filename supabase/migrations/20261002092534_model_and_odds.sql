-- Win-probability model (Elo) and bookmaker odds. Public read, server write. Idempotent.

create table if not exists public.player_ratings (
  tour text not null check (tour in ('atp', 'wta')),
  -- "id:<player id>" for linked players, "name:<normalized name>" otherwise.
  player_key text not null,
  player_id bigint references public.players (id) on delete cascade,
  name text,
  elo real not null,
  elo_hard real not null,
  elo_clay real not null,
  elo_grass real not null,
  matches integer not null,
  hard_matches integer not null default 0,
  clay_matches integer not null default 0,
  grass_matches integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tour, player_key)
);

create index if not exists player_ratings_player on public.player_ratings (player_id);

-- Calibrated model probability that player 1 wins, computed before the match (for upsets).
alter table public.matches add column if not exists pre_match_p1 real;

-- Moneyline odds per bookmaker for a match (American odds, as the provider sends them).
create table if not exists public.odds (
  match_id bigint not null references public.matches (id) on delete cascade,
  vendor text not null,
  player1_odds integer,
  player2_odds integer,
  updated_at timestamptz,
  primary key (match_id, vendor)
);

alter table public.player_ratings enable row level security;
alter table public.odds enable row level security;
revoke all on public.player_ratings, public.odds from anon, authenticated;
grant select on public.player_ratings, public.odds to anon, authenticated;

drop policy if exists "Model ratings are public" on public.player_ratings;
create policy "Model ratings are public" on public.player_ratings for select to anon, authenticated using (true);

drop policy if exists "Odds are public" on public.odds;
create policy "Odds are public" on public.odds for select to anon, authenticated using (true);

-- Bulk-set pre-match probabilities: [{ "id": 1, "p": 0.62 }, …]. Server only.
create or replace function public.set_pre_match_probs(p_rows jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.matches m
    set pre_match_p1 = (x ->> 'p')::real
    from jsonb_array_elements(p_rows) x
    where m.id = (x ->> 'id')::bigint
    returning 1
  )
  select count(*)::integer from u
$$;

revoke all on function public.set_pre_match_probs(jsonb) from public, anon, authenticated;
grant execute on function public.set_pre_match_probs(jsonb) to service_role;
