-- Bracket Challenge, private leagues and the pick history behind streaks and badges. Entries and
-- picks are private; scores are written by the server; leagues show nicknames only. Idempotent.

-- Bracket Challenge -------------------------------------------------------------------------------

create table if not exists public.bracket_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  -- [{ "w": "<winner key>", "l": "<loser key>" }, …] covering the whole draw.
  picks jsonb not null check (jsonb_typeof(picks) = 'array' and jsonb_array_length(picks) <= 255),
  score integer not null default 0,
  max_score integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, tournament_id)
);
create index if not exists bracket_entries_tournament on public.bracket_entries (tournament_id);

-- Open: the draw is readable, no result is in yet, and the tournament's first day hasn't ended.
create or replace function public.bracket_open(p_tournament_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tournaments t
    join public.wiki_draws d on d.tournament_id = t.id
    where t.id = p_tournament_id
      and coalesce((d.bracket ->> 'size')::int, 0) > 0
      and t.start_date is not null and now() < (t.start_date + 1)::timestamptz
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status = 'final' and m.confirmed
      )
  );
$$;
revoke all on function public.bracket_open(bigint) from public;
grant execute on function public.bracket_open(bigint) to anon, authenticated;

alter table public.bracket_entries enable row level security;
revoke all on public.bracket_entries from anon, authenticated;
grant select, insert (tournament_id, picks, updated_at), update (picks, updated_at), delete on public.bracket_entries to authenticated;

drop policy if exists "Users read their own brackets" on public.bracket_entries;
create policy "Users read their own brackets" on public.bracket_entries
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users enter open brackets" on public.bracket_entries;
create policy "Users enter open brackets" on public.bracket_entries
  for insert to authenticated with check ((select auth.uid()) = user_id and public.bracket_open(tournament_id));
drop policy if exists "Users change open brackets" on public.bracket_entries;
create policy "Users change open brackets" on public.bracket_entries
  for update to authenticated
  using ((select auth.uid()) = user_id and public.bracket_open(tournament_id))
  with check ((select auth.uid()) = user_id and public.bracket_open(tournament_id));
drop policy if exists "Users withdraw open brackets" on public.bracket_entries;
create policy "Users withdraw open brackets" on public.bracket_entries
  for delete to authenticated using ((select auth.uid()) = user_id and public.bracket_open(tournament_id));

-- Standings for one tournament: named players and the caller.
create or replace function public.bracket_leaderboard(p_tournament_id bigint)
returns table (name text, is_me boolean, score integer, max_score integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pr.leaderboard_name, 'You'), e.user_id = auth.uid(), e.score, e.max_score
  from public.bracket_entries e
  left join public.profiles pr on pr.id = e.user_id
  where e.tournament_id = p_tournament_id and (pr.leaderboard_name is not null or e.user_id = auth.uid())
  order by e.score desc, e.max_score desc, 1
  limit 100;
$$;
revoke all on function public.bracket_leaderboard(bigint) from public;
grant execute on function public.bracket_leaderboard(bigint) to anon, authenticated;

-- Private leagues ---------------------------------------------------------------------------------

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 40),
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,22}[A-Za-z0-9]$'),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id),
  unique (league_id, nickname)
);
create index if not exists league_members_user on public.league_members (user_id);

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.league_members where league_id = p_league_id and user_id = auth.uid());
$$;
revoke all on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
revoke all on public.leagues, public.league_members from anon, authenticated;
grant select, delete on public.leagues to authenticated;
grant select, delete on public.league_members to authenticated;

drop policy if exists "Members see their leagues" on public.leagues;
create policy "Members see their leagues" on public.leagues
  for select to authenticated using (public.is_league_member(id));
drop policy if exists "Owners delete their leagues" on public.leagues;
create policy "Owners delete their leagues" on public.leagues
  for delete to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Members see fellow members" on public.league_members;
create policy "Members see fellow members" on public.league_members
  for select to authenticated using (public.is_league_member(league_id));
drop policy if exists "Members leave leagues" on public.league_members;
create policy "Members leave leagues" on public.league_members
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Creates a league with the caller as owner and first member; returns the invite code.
create or replace function public.create_league(p_name text, p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
  lid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.leagues where owner_id = auth.uid()) >= 10 then
    raise exception 'league limit reached' using errcode = '54000';
  end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.leagues (name, invite_code, owner_id) values (trim(p_name), code, auth.uid()) returning id into lid;
  insert into public.league_members (league_id, user_id, nickname) values (lid, auth.uid(), trim(p_nickname));
  return code;
end $$;
revoke all on function public.create_league(text, text) from public;
grant execute on function public.create_league(text, text) to authenticated;

-- Joins (or renames yourself in) the league with this invite code; returns the league id.
create or replace function public.join_league(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id into lid from public.leagues where invite_code = upper(trim(p_code));
  if lid is null then raise exception 'no league with that code' using errcode = 'P0002'; end if;
  if (select count(*) from public.league_members where league_id = lid) >= 200 then
    raise exception 'league is full' using errcode = '54000';
  end if;
  insert into public.league_members (league_id, user_id, nickname) values (lid, auth.uid(), trim(p_nickname))
  on conflict (league_id, user_id) do update set nickname = excluded.nickname;
  return lid;
end $$;
revoke all on function public.join_league(text, text) from public;
grant execute on function public.join_league(text, text) to authenticated;

-- League table for members: season Pick'em record and Bracket Challenge points.
create or replace function public.league_standings(p_league_id uuid, p_since date)
returns table (nickname text, is_me boolean, correct integer, settled integer, bracket_points integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lm.nickname,
    lm.user_id = auth.uid(),
    coalesce(pk.correct, 0)::integer,
    coalesce(pk.settled, 0)::integer,
    coalesce(br.points, 0)::integer
  from public.league_members lm
  left join lateral (
    select count(*) filter (where p.side = m.winner_side) as correct, count(*) as settled
    from public.picks p join public.matches m on m.id = p.match_id
    join public.tournaments t on t.id = m.tournament_id
    where p.user_id = lm.user_id and m.status = 'final' and m.confirmed and m.winner_side is not null
      and coalesce(m.result_detail, '') <> 'walkover' and t.start_date >= p_since
  ) pk on true
  left join lateral (
    select sum(e.score) as points from public.bracket_entries e
    join public.tournaments t on t.id = e.tournament_id
    where e.user_id = lm.user_id and t.start_date >= p_since
  ) br on true
  where lm.league_id = p_league_id and public.is_league_member(p_league_id)
  order by coalesce(pk.correct, 0) + coalesce(br.points, 0) / 10 desc, lm.nickname;
$$;
revoke all on function public.league_standings(uuid, date) from public;
grant execute on function public.league_standings(uuid, date) to authenticated;

-- Streaks and badges ------------------------------------------------------------------------------

-- The caller's settled picks, oldest first.
create or replace function public.my_pick_history()
returns table (match_id bigint, side smallint, winner_side smallint, pre_match_p1 real, settled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.match_id, p.side, m.winner_side::smallint, m.pre_match_p1, coalesce(m.score_changed_at, p.picked_at)
  from public.picks p join public.matches m on m.id = p.match_id
  where p.user_id = auth.uid() and m.status = 'final' and m.confirmed and m.winner_side is not null
    and coalesce(m.result_detail, '') <> 'walkover'
  order by coalesce(m.score_changed_at, p.picked_at), p.match_id;
$$;
revoke all on function public.my_pick_history() from public;
grant execute on function public.my_pick_history() to authenticated;
