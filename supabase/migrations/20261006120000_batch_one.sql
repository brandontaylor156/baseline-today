-- Upset rates, model accuracy, "on this day" finals, next-match notifications and public leagues.
-- Read functions return aggregates of public match data only. Idempotent.

-- How often the model's favorite lost, by tour, surface, round, season and in the last 7 days.
create or replace function public.upset_rates(p_from_season integer default 2016)
returns table (dimension text, key text, matches integer, upsets integer, favorite_chance real)
language sql
stable
set search_path = ''
as $$
  with m as (
    select
      m.tour,
      case when t.surface ilike '%clay%' then 'Clay' when t.surface ilike '%grass%' then 'Grass' when t.surface is null then null else 'Hard' end as surface,
      case
        when m.round in ('Final', 'Finals') then '1 Final'
        when m.round in ('Semifinals', 'Semifinal') then '2 Semifinals'
        when m.round in ('Quarterfinals', 'Quarterfinal') then '3 Quarterfinals'
        when m.round ilike 'fourth round%' or m.round ilike 'round of 16%' then '4 Round of 16'
        when m.round ilike 'third round%' then '5 Third round'
        when m.round ilike 'second round%' then '6 Second round'
        when m.round ilike 'first round%' then '7 First round'
        else null
      end as round,
      m.season,
      t.end_date >= current_date - 7 and t.start_date <= current_date as recent,
      greatest(m.pre_match_p1, 1 - m.pre_match_p1) as fav,
      (m.pre_match_p1 >= 0.5) <> (m.winner_side = 1) as upset
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and m.pre_match_p1 is not null
      and coalesce(m.result_detail, '') <> 'walkover' and m.season >= p_from_season
  )
  select 'tour', upper(tour), count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m group by tour
  union all
  select 'surface', surface, count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m where surface is not null group by surface
  union all
  select 'round', round, count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m where round is not null group by round
  union all
  select 'season', season::text, count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m group by season
  union all
  select 'recent', 'Last 7 days', count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m where recent
  union all
  select 'all', 'All', count(*)::integer, count(*) filter (where upset)::integer, avg(fav)::real from m;
$$;

-- The model's record by season, tour and surface, and against "the higher-ranked player wins" on
-- matches where both players were in the latest top-100 snapshot before the tournament (2025 on).
create or replace function public.model_accuracy()
returns table (season integer, tour text, surface text, matches integer, correct integer, brier real, ranked integer, ranked_model_correct integer, ranked_rank_correct integer)
language sql
stable
set search_path = ''
as $$
  with m as (
    select
      m.season, m.tour,
      case when t.surface ilike '%clay%' then 'Clay' when t.surface ilike '%grass%' then 'Grass' else 'Hard' end as surface,
      m.pre_match_p1 as p, (m.winner_side = 1) as p1_won,
      -- Ranking history starts in 2025: only look ranks up from then on.
      case when m.season >= 2025 then (select r.rank from public.rankings r where r.player_id = m.player1_id and r.tour = m.tour and r.ranking_date <= t.start_date order by r.ranking_date desc limit 1) end as rank1,
      case when m.season >= 2025 then (select r.rank from public.rankings r where r.player_id = m.player2_id and r.tour = m.tour and r.ranking_date <= t.start_date order by r.ranking_date desc limit 1) end as rank2
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and m.pre_match_p1 is not null
      and coalesce(m.result_detail, '') <> 'walkover' and m.season is not null
  )
  select
    season, tour, surface,
    count(*)::integer,
    count(*) filter (where (p >= 0.5) = p1_won)::integer,
    avg(power(p - case when p1_won then 1 else 0 end, 2))::real,
    count(*) filter (where rank1 is not null and rank2 is not null and season >= 2025)::integer,
    count(*) filter (where rank1 is not null and rank2 is not null and season >= 2025 and (p >= 0.5) = p1_won)::integer,
    count(*) filter (where rank1 is not null and rank2 is not null and season >= 2025 and (rank1 < rank2) = p1_won)::integer
  from m
  group by season, tour, surface
  order by season, tour, surface;
$$;

-- Finals that ended on this calendar day in earlier seasons.
create or replace function public.finals_on_day(p_month integer, p_day integer)
returns table (match_id bigint, season integer, tour text, tournament_id bigint, tournament text, category text, winner_id bigint, winner text, loser_id bigint, loser text, set_scores jsonb, winner_side smallint)
language sql
stable
set search_path = ''
as $$
  select
    m.id, m.season, m.tour, t.id, t.name, t.category,
    case when m.winner_side = 1 then m.player1_id else m.player2_id end,
    case when m.winner_side = 1 then coalesce(p1.full_name, m.player1_name) else coalesce(p2.full_name, m.player2_name) end,
    case when m.winner_side = 1 then m.player2_id else m.player1_id end,
    case when m.winner_side = 1 then coalesce(p2.full_name, m.player2_name) else coalesce(p1.full_name, m.player1_name) end,
    m.set_scores, m.winner_side::smallint
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  left join public.players p1 on p1.id = m.player1_id
  left join public.players p2 on p2.id = m.player2_id
  where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and m.round in ('Final', 'Finals')
    and extract(month from t.end_date) = p_month and extract(day from t.end_date) = p_day
    and t.end_date < current_date
  order by m.season desc, t.category nulls last, t.name;
$$;

revoke all on function public.upset_rates(integer) from public;
revoke all on function public.model_accuracy() from public;
revoke all on function public.finals_on_day(integer, integer) from public;
grant execute on function public.upset_rates(integer) to anon, authenticated;
grant execute on function public.model_accuracy() to anon, authenticated;
grant execute on function public.finals_on_day(integer, integer) to anon, authenticated;

-- Next-match notifications: each scheduled match is announced to fans once.
alter table public.matches add column if not exists preview_notified_at timestamptz;

-- Public leagues: owners can list a league in the directory; anyone can then join with its code.
alter table public.leagues add column if not exists is_public boolean not null default false;

create or replace function public.set_league_public(p_league_id uuid, p_public boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leagues set is_public = p_public where id = p_league_id and owner_id = auth.uid();
  if not found then raise exception 'only the owner can change this' using errcode = '42501'; end if;
end;
$$;

create or replace function public.public_leagues()
returns table (name text, invite_code text, members integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.invite_code, (select count(*) from public.league_members lm where lm.league_id = l.id)::integer, l.created_at
  from public.leagues l
  where l.is_public
  order by 3 desc, l.created_at desc
  limit 100;
$$;

revoke all on function public.set_league_public(uuid, boolean) from public, anon;
grant execute on function public.set_league_public(uuid, boolean) to authenticated;
revoke all on function public.public_leagues() from public;
grant execute on function public.public_leagues() to anon, authenticated;
