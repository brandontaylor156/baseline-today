-- Tournament history and all-time records. Records are expensive, so the daily job stores them in
-- stat_cache (public read) through refresh_stat_cache(); pages read the cache. Idempotent.

create table if not exists public.stat_cache (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.stat_cache enable row level security;
revoke all on public.stat_cache from anon, authenticated;
grant select on public.stat_cache to anon, authenticated;
drop policy if exists "Stat cache is public" on public.stat_cache;
create policy "Stat cache is public" on public.stat_cache for select to anon, authenticated using (true);

-- Confirmed results with both players linked, flattened to winner/loser (walkovers excluded).
create or replace view public.result_lines with (security_invoker = true) as
  select
    m.id, m.tour, m.season, t.id as tournament_id, t.name as tournament, t.category, t.start_date, t.end_date,
    case when t.surface ilike '%clay%' then 'Clay' when t.surface ilike '%grass%' then 'Grass' when t.surface is null then null else 'Hard' end as surface,
    m.round,
    case
      when m.round in ('Final', 'Finals') then 7 when m.round = 'Semifinals' then 6 when m.round = 'Quarterfinals' then 5
      when m.round ilike 'fourth round%' or m.round ilike 'round of 16%' then 4 when m.round ilike 'third round%' then 3
      when m.round ilike 'second round%' then 2 else 1
    end as round_rank,
    case when m.winner_side = 1 then m.player1_id else m.player2_id end as winner_id,
    case when m.winner_side = 1 then m.player2_id else m.player1_id end as loser_id,
    case when m.winner_side = 1 then m.pre_match_p1 else 1 - m.pre_match_p1 end as winner_chance,
    m.winner_side, m.set_scores, m.result_detail
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and coalesce(m.result_detail, '') <> 'walkover';
-- Public match data only (security_invoker: the matches table's own RLS still applies).
revoke all on public.result_lines from anon, authenticated;
grant select on public.result_lines to anon, authenticated;

-- One tour's all-time records since 2015 as JSON.
create or replace function public.compute_records(p_tour text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (select * from public.result_lines where tour = p_tour),
  named as (select id, full_name as name, country_code as country, birth_date from public.players),
  finals as (select * from r where round in ('Final', 'Finals') and winner_id is not null),
  -- Every match from each player's side, in order, for streaks.
  sides as (
    select winner_id as player_id, true as won, start_date, round_rank, id, tournament, season from r where winner_id is not null
    union all
    select loser_id, false, start_date, round_rank, id, tournament, season from r where loser_id is not null
  ),
  seq as (
    select *, sum(case when won then 0 else 1 end) over (partition by player_id order by start_date, round_rank, id) as losses_so_far from sides
  ),
  streaks as (
    select player_id, count(*) as wins, min(start_date) as from_date, max(start_date) as to_date,
      (array_agg(tournament order by start_date, round_rank, id))[1] as from_event,
      (array_agg(tournament order by start_date desc, round_rank desc, id desc))[1] as to_event
    from seq where won group by player_id, losses_so_far
  ),
  sets as (
    select r.winner_id, r.loser_id, r.winner_side, (s->>'p1')::int as p1, (s->>'p2')::int as p2
    from r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.set_scores) = 'array' then r.set_scores else '[]'::jsonb end) s
    where s->>'p1' is not null and s->>'p2' is not null
  ),
  tiebreaks as (
    select case when (p1 > p2) = (winner_side = 1) then winner_id else loser_id end as player_id, count(*) as won from sets
    where (p1 = 7 and p2 = 6) or (p1 = 6 and p2 = 7) group by 1
  ),
  bagels as (
    select case when (p1 > p2) = (winner_side = 1) then winner_id else loser_id end as player_id, count(*) as won from sets
    where (p1 = 6 and p2 = 0) or (p1 = 0 and p2 = 6) group by 1
  ),
  comebacks as (
    select winner_id as player_id, count(*) as won from r
    where winner_id is not null and jsonb_typeof(set_scores) = 'array' and jsonb_array_length(set_scores) >= 3
      and ((winner_side = 1 and (set_scores->0->>'p1')::int < (set_scores->0->>'p2')::int) or (winner_side = 2 and (set_scores->0->>'p2')::int < (set_scores->0->>'p1')::int))
    group by 1
  )
  select jsonb_build_object(
    'titles', (select coalesce(jsonb_agg(x order by x.n desc, x.name), '[]') from (
      select f.winner_id as id, n.name, n.country, count(*) as n,
        count(*) filter (where f.category ilike '%grand slam%') as slams
      from finals f join named n on n.id = f.winner_id group by f.winner_id, n.name, n.country order by count(*) desc limit 15) x),
    'titles_by_surface', (select coalesce(jsonb_object_agg(surface, list), '{}') from (
      select surface, jsonb_agg(jsonb_build_object('id', id, 'name', name, 'country', country, 'n', n) order by n desc, name) as list from (
        select f.surface, f.winner_id as id, n.name, n.country, count(*) as n, row_number() over (partition by f.surface order by count(*) desc, n.name) as rk
        from finals f join named n on n.id = f.winner_id where f.surface is not null group by f.surface, f.winner_id, n.name, n.country) y
      where rk <= 5 group by surface) z),
    'finals', (select coalesce(jsonb_agg(x order by x.n desc, x.name), '[]') from (
      select p.id, n.name, n.country, count(*) as n from (select winner_id as id from finals union all select loser_id from finals where loser_id is not null) p
      join named n on n.id = p.id group by p.id, n.name, n.country order by count(*) desc limit 10) x),
    'streaks', (select coalesce(jsonb_agg(x order by x.wins desc, x.to_date desc), '[]') from (
      select s.player_id as id, n.name, n.country, s.wins, s.from_date, s.to_date, s.from_event, s.to_event
      from streaks s join named n on n.id = s.player_id order by s.wins desc, s.to_date desc limit 10) x),
    'youngest', (select coalesce(jsonb_agg(x order by x.days), '[]') from (
      select f.winner_id as id, n.name, n.country, f.tournament, f.season, f.id as match_id, (f.end_date - n.birth_date) as days
      from finals f join named n on n.id = f.winner_id where n.birth_date is not null and f.end_date is not null order by days limit 10) x),
    'oldest', (select coalesce(jsonb_agg(x order by x.days desc), '[]') from (
      select f.winner_id as id, n.name, n.country, f.tournament, f.season, f.id as match_id, (f.end_date - n.birth_date) as days
      from finals f join named n on n.id = f.winner_id where n.birth_date is not null and f.end_date is not null order by days desc limit 10) x),
    'final_upsets', (select coalesce(jsonb_agg(x order by x.chance), '[]') from (
      select f.id as match_id, f.winner_id as id, w.name, w.country, l.name as loser, f.tournament, f.season, f.winner_chance as chance
      from finals f join named w on w.id = f.winner_id left join named l on l.id = f.loser_id
      where f.winner_chance is not null order by f.winner_chance limit 10) x),
    'tiebreaks', (select coalesce(jsonb_agg(x order by x.n desc, x.name), '[]') from (
      select t.player_id as id, n.name, n.country, t.won as n from tiebreaks t join named n on n.id = t.player_id order by t.won desc limit 10) x),
    'bagels', (select coalesce(jsonb_agg(x order by x.n desc, x.name), '[]') from (
      select b.player_id as id, n.name, n.country, b.won as n from bagels b join named n on n.id = b.player_id order by b.won desc limit 10) x),
    'comebacks', (select coalesce(jsonb_agg(x order by x.n desc, x.name), '[]') from (
      select c.player_id as id, n.name, n.country, c.won as n from comebacks c join named n on n.id = c.player_id order by c.won desc limit 10) x),
    'matches', (select count(*) from r)
  );
$$;

-- Refreshed by the daily job (service role).
create or replace function public.refresh_stat_cache()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stat_cache (key, data, updated_at)
  values ('records:atp', public.compute_records('atp'), now()), ('records:wta', public.compute_records('wta'), now())
  on conflict (key) do update set data = excluded.data, updated_at = excluded.updated_at;
$$;
revoke all on function public.compute_records(text) from public, anon, authenticated;
revoke all on function public.refresh_stat_cache() from public, anon, authenticated;
grant execute on function public.refresh_stat_cache() to service_role;

-- Tournament history: every event (one row per tour + provider id) and its seasons with the final.
create or replace function public.event_list()
returns table (tour text, provider_id bigint, name text, category text, surface text, seasons integer, latest_id bigint, latest_season integer)
language sql
stable
set search_path = ''
as $$
  select distinct on (t.tour, t.provider_id)
    t.tour, t.provider_id, t.name, t.category, t.surface,
    (select count(*) from public.tournaments x where x.tour = t.tour and x.provider_id = t.provider_id and x.provider = 'balldontlie')::integer,
    t.id, t.season
  from public.tournaments t
  where t.provider = 'balldontlie' and t.category is not null and t.season >= 2015
  order by t.tour, t.provider_id, t.season desc;
$$;

create or replace function public.event_history(p_tour text, p_provider_id bigint)
returns table (tournament_id bigint, season integer, name text, category text, surface text, start_date date, end_date date, draw_size integer,
  match_id bigint, winner_id bigint, winner text, loser_id bigint, loser text, set_scores jsonb, winner_side smallint, winner_chance real)
language sql
stable
set search_path = ''
as $$
  select t.id, t.season, t.name, t.category, t.surface, t.start_date, t.end_date, t.draw_size,
    f.id, f.winner_id, coalesce(pw.full_name, case when f.winner_side = 1 then m.player1_name else m.player2_name end),
    f.loser_id, coalesce(pl.full_name, case when f.winner_side = 1 then m.player2_name else m.player1_name end),
    f.set_scores, f.winner_side::smallint, f.winner_chance::real
  from public.tournaments t
  left join public.result_lines f on f.tournament_id = t.id and f.round in ('Final', 'Finals')
  left join public.matches m on m.id = f.id
  left join public.players pw on pw.id = f.winner_id
  left join public.players pl on pl.id = f.loser_id
  where t.provider = 'balldontlie' and t.tour = p_tour and t.provider_id = p_provider_id and t.season >= 2015
  order by t.season desc;
$$;

create or replace function public.event_upsets(p_tour text, p_provider_id bigint, p_limit integer default 8)
returns table (match_id bigint, season integer, round text, winner_id bigint, winner text, loser_id bigint, loser text, winner_chance real)
language sql
stable
set search_path = ''
as $$
  select r.id, r.season, r.round, r.winner_id, coalesce(pw.full_name, case when r.winner_side = 1 then m.player1_name else m.player2_name end),
    r.loser_id, coalesce(pl.full_name, case when r.winner_side = 1 then m.player2_name else m.player1_name end), r.winner_chance::real
  from public.result_lines r
  join public.tournaments t on t.id = r.tournament_id
  join public.matches m on m.id = r.id
  left join public.players pw on pw.id = r.winner_id
  left join public.players pl on pl.id = r.loser_id
  where t.provider = 'balldontlie' and t.tour = p_tour and t.provider_id = p_provider_id and r.winner_chance is not null
  order by r.winner_chance
  limit p_limit;
$$;

revoke all on function public.event_list() from public;
revoke all on function public.event_history(text, bigint) from public;
revoke all on function public.event_upsets(text, bigint, integer) from public;
grant execute on function public.event_list() to anon, authenticated;
grant execute on function public.event_history(text, bigint) to anon, authenticated;
grant execute on function public.event_upsets(text, bigint, integer) to anon, authenticated;
