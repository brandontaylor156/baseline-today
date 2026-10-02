-- Pick'em: signed-in users pick winners of upcoming matches. Picks are private to their owner and
-- can only be made or changed while the match is still open. The leaderboard shows only players
-- who chose a public leaderboard name. Idempotent.

-- Optional public name for the leaderboard (never the Google name).
alter table public.profiles add column if not exists leaderboard_name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_leaderboard_name_format') then
    alter table public.profiles add constraint profiles_leaderboard_name_format
      check (leaderboard_name ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,22}[A-Za-z0-9]$');
  end if;
end $$;
create unique index if not exists profiles_leaderboard_name_unique on public.profiles (lower(leaderboard_name)) where leaderboard_name is not null;
grant update (leaderboard_name) on public.profiles to authenticated;

create table if not exists public.picks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_id bigint not null references public.matches (id) on delete cascade,
  side smallint not null check (side in (1, 2)),
  picked_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index if not exists picks_match on public.picks (match_id);

-- Open for picks: still scheduled, and not past its start time when one is known.
create or replace function public.match_open_for_picks(p_match_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id and m.status = 'scheduled' and m.confirmed
      and (m.scheduled_at is null or m.scheduled_at > now())
  );
$$;
revoke all on function public.match_open_for_picks(bigint) from public;
grant execute on function public.match_open_for_picks(bigint) to authenticated;

alter table public.picks enable row level security;
revoke all on public.picks from anon, authenticated;
grant select, insert, update (side, picked_at), delete on public.picks to authenticated;

drop policy if exists "Users read their own picks" on public.picks;
create policy "Users read their own picks" on public.picks
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users pick open matches" on public.picks;
create policy "Users pick open matches" on public.picks
  for insert to authenticated with check ((select auth.uid()) = user_id and public.match_open_for_picks(match_id));

drop policy if exists "Users change picks on open matches" on public.picks;
create policy "Users change picks on open matches" on public.picks
  for update to authenticated
  using ((select auth.uid()) = user_id and public.match_open_for_picks(match_id))
  with check ((select auth.uid()) = user_id and public.match_open_for_picks(match_id));

drop policy if exists "Users remove picks on open matches" on public.picks;
create policy "Users remove picks on open matches" on public.picks
  for delete to authenticated using ((select auth.uid()) = user_id and public.match_open_for_picks(match_id));

-- Leaderboard since a date: named players, plus the caller's own row (named or not). model_correct
-- is the model's record on the same matches (its pre-match favourite), so players can compare.
create or replace function public.pickem_leaderboard(p_since date)
returns table (name text, is_me boolean, correct integer, settled integer, model_correct integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(pr.leaderboard_name, 'You') as name,
    p.user_id = auth.uid() as is_me,
    count(*) filter (where p.side = m.winner_side)::integer as correct,
    count(*)::integer as settled,
    count(*) filter (where m.pre_match_p1 is not null and (m.pre_match_p1 >= 0.5) = (m.winner_side = 1))::integer as model_correct
  from public.picks p
  join public.matches m on m.id = p.match_id
  join public.tournaments t on t.id = m.tournament_id
  left join public.profiles pr on pr.id = p.user_id
  where m.status = 'final' and m.confirmed and m.winner_side is not null
    and coalesce(m.result_detail, '') <> 'walkover'
    and t.start_date >= p_since - 7
    and coalesce(m.score_changed_at, now()) >= p_since
    and (pr.leaderboard_name is not null or p.user_id = auth.uid())
  group by p.user_id, pr.leaderboard_name
  order by correct desc, settled asc, name
  limit 100;
$$;
revoke all on function public.pickem_leaderboard(date) from public;
grant execute on function public.pickem_leaderboard(date) to anon, authenticated;
