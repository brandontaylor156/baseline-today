-- When each rated player last played a tracked match (start date of that tournament), so the
-- ratings page lists active players only. Idempotent.
alter table public.player_ratings add column if not exists last_played date;
create index if not exists player_ratings_active on public.player_ratings (tour, last_played);
