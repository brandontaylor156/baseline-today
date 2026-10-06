-- Results profiles for player similarity: what each player's results since 2023 say about how they
-- win (surface strengths, tiebreaks, deciding sets, comebacks, as underdog or favourite, dominance).
-- Public match data only. Idempotent.
create or replace function public.lab_profiles(p_tour text, p_since integer default 2023, p_min integer default 40)
returns table (
  player_id bigint, name text, country text, matches integer, win_rate real,
  tiebreak_rate real, deciding_rate real, comeback_rate real, underdog_rate real, favourite_rate real,
  straight_share real, game_share real, hard_edge real, clay_edge real, grass_edge real
)
language sql
stable
set search_path = ''
as $$
  with lines as (
    select
      case when side = 1 then m.player1_id else m.player2_id end as pid,
      (m.winner_side = side) as won,
      case when side = 1 then m.pre_match_p1 else 1 - m.pre_match_p1 end as chance,
      m.set_scores, side, t.category, m.tour
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    cross join (values (1), (2)) s(side)
    where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and m.tour = p_tour and m.season >= p_since
      and coalesce(m.result_detail, '') not in ('walkover', 'retired')
      and jsonb_typeof(m.set_scores) = 'array'
  ),
  sets as (
    select l.pid, l.won, l.side, ord,
      (case when l.side = 1 then (s->>'p1')::int else (s->>'p2')::int end) as mine,
      (case when l.side = 1 then (s->>'p2')::int else (s->>'p1')::int end) as theirs,
      jsonb_array_length(l.set_scores) as n, l.category
    from lines l cross join lateral jsonb_array_elements(l.set_scores) with ordinality as e(s, ord)
    where s->>'p1' is not null and s->>'p2' is not null and l.pid is not null
  ),
  per_set as (
    select pid,
      count(*) filter (where (mine = 7 and theirs = 6) or (mine = 6 and theirs = 7)) as tb_played,
      count(*) filter (where mine = 7 and theirs = 6) as tb_won,
      sum(mine) as games_won, sum(mine + theirs) as games
    from sets group by pid
  ),
  per_match as (
    select l.pid, count(*) as n, count(*) filter (where l.won) as w,
      -- Deciding set reached: the match went the full distance.
      count(*) filter (where jsonb_array_length(l.set_scores) = case when l.tour = 'atp' and l.category ilike '%grand slam%' then 5 else 3 end) as dec_played,
      count(*) filter (where l.won and jsonb_array_length(l.set_scores) = case when l.tour = 'atp' and l.category ilike '%grand slam%' then 5 else 3 end) as dec_won,
      count(*) filter (where (case when l.side = 1 then (l.set_scores->0->>'p1')::int < (l.set_scores->0->>'p2')::int else (l.set_scores->0->>'p2')::int < (l.set_scores->0->>'p1')::int end)) as lost_first,
      count(*) filter (where l.won and (case when l.side = 1 then (l.set_scores->0->>'p1')::int < (l.set_scores->0->>'p2')::int else (l.set_scores->0->>'p2')::int < (l.set_scores->0->>'p1')::int end)) as comebacks,
      count(*) filter (where l.chance < 0.5) as dog, count(*) filter (where l.chance < 0.5 and l.won) as dog_won,
      count(*) filter (where l.chance >= 0.5) as fav, count(*) filter (where l.chance >= 0.5 and l.won) as fav_won,
      count(*) filter (where l.won and jsonb_array_length(l.set_scores) = case when l.tour = 'atp' and l.category ilike '%grand slam%' then 3 else 2 end) as straight
    from lines l where l.pid is not null group by l.pid
  )
  select pm.pid, p.full_name, p.country_code, pm.n::integer, (pm.w::real / pm.n),
    (ps.tb_won::real / nullif(ps.tb_played, 0)), (pm.dec_won::real / nullif(pm.dec_played, 0)),
    (pm.comebacks::real / nullif(pm.lost_first, 0)), (pm.dog_won::real / nullif(pm.dog, 0)), (pm.fav_won::real / nullif(pm.fav, 0)),
    (pm.straight::real / nullif(pm.w, 0)), (ps.games_won::real / nullif(ps.games, 0)),
    (r.elo_hard - r.elo)::real, (r.elo_clay - r.elo)::real, (r.elo_grass - r.elo)::real
  from per_match pm
  join per_set ps on ps.pid = pm.pid
  join public.players p on p.id = pm.pid
  left join public.player_ratings r on r.player_id = pm.pid and r.tour = p_tour
  where pm.n >= p_min;
$$;

revoke all on function public.lab_profiles(text, integer, integer) from public;
grant execute on function public.lab_profiles(text, integer, integer) to anon, authenticated;

-- The daily cache now also holds the profiles (1–2 s to compute: too slow for page views).
create or replace function public.refresh_stat_cache()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stat_cache (key, data, updated_at)
  values
    ('records:atp', public.compute_records('atp'), now()),
    ('records:wta', public.compute_records('wta'), now()),
    ('profiles:atp', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.lab_profiles('atp') p), now()),
    ('profiles:wta', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.lab_profiles('wta') p), now())
  on conflict (key) do update set data = excluded.data, updated_at = excluded.updated_at;
$$;
revoke all on function public.refresh_stat_cache() from public, anon, authenticated;
grant execute on function public.refresh_stat_cache() to service_role;
