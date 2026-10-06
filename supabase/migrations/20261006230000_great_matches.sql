-- Greatest matches: a quality score from both players' ratings going into the event (lab), the
-- drama (deciding set, tiebreaks, games margin) and the stakes (round, event level). Top 50 overall
-- and top 10 per season, per tour, cached daily in stat_cache (great:<tour>). Idempotent.
create or replace function public.compute_great_matches(p_tour text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with scored as (
    select r.id, r.season, r.tournament_id, r.tournament, r.category, r.round, r.winner_side, r.set_scores,
      r.winner_id, r.loser_id, ra.rating as r1, rb.rating as r2,
      jsonb_array_length(r.set_scores) as nsets,
      case when r.tour = 'atp' and r.category ilike '%grand slam%' then 5 else 3 end as best_of,
      (select count(*) from jsonb_array_elements(r.set_scores) s where (s->>'p1')::int + (s->>'p2')::int = 13) as tiebreaks,
      (select abs(sum((s->>'p1')::int - (s->>'p2')::int)) from jsonb_array_elements(r.set_scores) s) as margin
    from public.result_lines r
    join public.lab_title_chances ra on ra.tournament_id = r.tournament_id and ra.player_id = r.winner_id
    join public.lab_title_chances rb on rb.tournament_id = r.tournament_id and rb.player_id = r.loser_id
    where r.tour = p_tour and jsonb_typeof(r.set_scores) = 'array' and coalesce(r.result_detail, '') = ''
  ),
  quality as (
    select *,
      ((r1 + r2) / 2.0 - 1700) / 100.0
      + case when nsets = best_of then 1.5 else 0 end
      + 0.5 * tiebreaks
      + greatest(0, 1.2 - margin * 0.15)
      + case when round in ('Final', 'Finals') then 2 when round = 'Semifinals' then 1.2 when round = 'Quarterfinals' then 0.7 else 0 end
      + case when category ilike '%grand slam%' then 1 when category ilike '%1000%' then 0.5 else 0 end as q
    from scored
  ),
  ranked as (
    select *, row_number() over (order by q desc) as overall_rank, row_number() over (partition by season order by q desc) as season_rank
    from quality
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id', k.id, 'season', k.season, 'tournament_id', k.tournament_id, 'tournament', k.tournament, 'category', k.category,
    'round', k.round, 'winner_id', k.winner_id, 'winner', w.full_name, 'winner_country', w.country_code,
    'loser_id', k.loser_id, 'loser', l.full_name, 'loser_country', l.country_code,
    'sets', k.set_scores, 'winner_side', k.winner_side, 'quality', round(k.q::numeric, 2), 'overall_rank', k.overall_rank
  ) order by k.q desc), '[]')
  from ranked k
  join public.players w on w.id = k.winner_id
  join public.players l on l.id = k.loser_id
  where k.overall_rank <= 50 or k.season_rank <= 10;
$$;
revoke all on function public.compute_great_matches(text) from public, anon, authenticated;

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
    ('profiles:wta', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.lab_profiles('wta') p), now()),
    ('great:atp', public.compute_great_matches('atp'), now()),
    ('great:wta', public.compute_great_matches('wta'), now())
  on conflict (key) do update set data = excluded.data, updated_at = excluded.updated_at;
$$;
revoke all on function public.refresh_stat_cache() from public, anon, authenticated;
grant execute on function public.refresh_stat_cache() to service_role;
