-- Playing hand, backhand and height from each player's Wikidata item (CC0), for linked players and
-- players known only from the draws (via lab_people). Only what Wikidata records; null when it doesn't.

create table if not exists public.player_traits (
  player_key text primary key,
  tour text not null,
  wikidata_id text not null,
  hand text check (hand in ('left', 'right')),
  backhand text check (backhand in ('one', 'two')),
  height_cm real,
  checked_at timestamptz not null default now()
);

alter table public.player_traits enable row level security;
drop policy if exists "player_traits readable" on public.player_traits;
create policy "player_traits readable" on public.player_traits for select to anon, authenticated using (true);

-- Where each value came from: 'wikidata', or 'wikipedia' (the article's infobox) for gaps Wikidata leaves.
alter table public.player_traits add column if not exists source text not null default 'wikidata';
alter table public.player_traits add column if not exists article text;
