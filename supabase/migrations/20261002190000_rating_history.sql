-- Weekly model rating per linked player (rating after their last match that week; weeks start on
-- Monday of the tournament's start). Public read, server write. Idempotent.
create table if not exists public.player_rating_history (
  tour text not null check (tour in ('atp', 'wta')),
  player_id bigint not null references public.players (id) on delete cascade,
  week date not null,
  elo real not null,
  primary key (player_id, week)
);

alter table public.player_rating_history enable row level security;
revoke all on public.player_rating_history from anon, authenticated;
grant select on public.player_rating_history to anon, authenticated;

drop policy if exists "Rating history is public" on public.player_rating_history;
create policy "Rating history is public" on public.player_rating_history
  for select to anon, authenticated using (true);
