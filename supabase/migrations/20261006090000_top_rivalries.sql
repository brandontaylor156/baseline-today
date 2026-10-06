-- Rivalries for the sitemap: pairs of players in their tour's latest top 100 with at least
-- p_min meetings in the tracked results. Public match data only. Idempotent.
create or replace function public.top_rivalries(p_min integer default 3, p_limit integer default 1000)
returns table (player_a bigint, name_a text, player_b bigint, name_b text, meetings integer)
language sql
stable
set search_path = ''
as $$
  with latest as (
    select r.tour, max(r.ranking_date) as d from public.rankings r group by r.tour
  ),
  top as (
    select r.player_id from public.rankings r join latest l on l.tour = r.tour and l.d = r.ranking_date
    where r.rank <= 100
  ),
  pairs as (
    select least(m.player1_id, m.player2_id) as a, greatest(m.player1_id, m.player2_id) as b, count(*)::integer as n
    from public.matches m
    where m.status = 'final' and m.confirmed and m.player1_id is not null and m.player2_id is not null
      and m.player1_id in (select player_id from top) and m.player2_id in (select player_id from top)
    group by 1, 2
    having count(*) >= p_min
  )
  select p.a, pa.full_name, p.b, pb.full_name, p.n
  from pairs p
  join public.players pa on pa.id = p.a
  join public.players pb on pb.id = p.b
  order by p.n desc, p.a, p.b
  limit p_limit;
$$;

revoke all on function public.top_rivalries(integer, integer) from public;
grant execute on function public.top_rivalries(integer, integer) to anon, authenticated;
