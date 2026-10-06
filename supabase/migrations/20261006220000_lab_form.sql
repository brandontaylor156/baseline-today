-- Form right now: each player's wins in the last p_days against what the model expected (sum of
-- pre-match chances). Public match data only. Idempotent.
create or replace function public.lab_form(p_tour text, p_days integer default 60, p_min integer default 6)
returns table (player_id bigint, name text, country text, matches integer, wins integer, expected real, last_match date)
language sql
stable
set search_path = ''
as $$
  with recent as (
    -- Tournaments in the window first (indexed), then only their matches.
    select t.id, t.end_date from public.tournaments t
    where t.tour = p_tour and t.end_date >= current_date - p_days and t.start_date <= current_date
  ),
  lines as (
    select case when s.side = 1 then m.player1_id else m.player2_id end as pid,
      (m.winner_side = s.side) as won,
      case when s.side = 1 then m.pre_match_p1 else 1 - m.pre_match_p1 end as chance,
      r.end_date
    from recent r
    join public.matches m on m.tournament_id = r.id
    cross join (values (1), (2)) s(side)
    where m.status = 'final' and m.confirmed and m.winner_side in (1, 2) and m.pre_match_p1 is not null
      and coalesce(m.result_detail, '') <> 'walkover'
  )
  select l.pid, p.full_name, p.country_code, count(*)::integer, count(*) filter (where l.won)::integer, sum(l.chance)::real, max(l.end_date)
  from lines l
  join public.players p on p.id = l.pid
  group by l.pid, p.full_name, p.country_code
  having count(*) >= p_min;
$$;
revoke all on function public.lab_form(text, integer, integer) from public;
grant execute on function public.lab_form(text, integer, integer) to anon, authenticated;
