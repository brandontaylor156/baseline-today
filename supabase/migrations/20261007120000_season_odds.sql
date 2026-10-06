-- The season simulator's daily odds per player, kept so pages can chart how they moved.

create table if not exists public.season_odds (
  tour text not null,
  day date not null,
  player_id bigint not null references public.players (id) on delete cascade,
  finals real not null,
  no1 real not null,
  top10 real not null,
  primary key (tour, day, player_id)
);
create index if not exists season_odds_player on public.season_odds (player_id, day);

alter table public.season_odds enable row level security;
drop policy if exists "season_odds readable" on public.season_odds;
create policy "season_odds readable" on public.season_odds for select to anon, authenticated using (true);
