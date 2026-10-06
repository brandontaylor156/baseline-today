-- Sample league for signed-out visitors: four bots with fixed strategies, scored on every settled
-- result of the season that has a model prediction. Reads only public match data. Idempotent.
create or replace function public.sample_league_standings(p_season integer)
returns table (nickname text, strategy text, correct integer, settled integer)
language sql
stable
set search_path = ''
as $$
  with settled as (
    select
      m.winner_side,
      case when m.pre_match_p1 >= 0.5 then 1 else 2 end as favorite,
      -- A fair coin per match, the same on every visit.
      (get_byte(decode(md5(m.id::text), 'hex'), 0) % 2) + 1 as coin,
      case when lower(coalesce(p1.full_name, m.player1_name, '')) <= lower(coalesce(p2.full_name, m.player2_name, '')) then 1 else 2 end as alphabetical
    from public.matches m
    left join public.players p1 on p1.id = m.player1_id
    left join public.players p2 on p2.id = m.player2_id
    where m.season = p_season and m.status = 'final' and m.confirmed and m.winner_side in (1, 2)
      and m.pre_match_p1 is not null and coalesce(m.result_detail, '') <> 'walkover'
  ),
  bots (nickname, strategy, ord) as (
    values
      ('Favorite Fran', 'Always picks the model''s favorite', 1),
      ('Coin Flip Cal', 'Flips a coin', 2),
      ('Alphabet Al', 'Picks whoever comes first alphabetically', 3),
      ('Underdog Uma', 'Always picks the underdog', 4)
  )
  select
    b.nickname,
    b.strategy,
    (count(*) filter (where s.winner_side = case b.ord when 1 then s.favorite when 2 then s.coin when 3 then s.alphabetical else 3 - s.favorite end))::integer,
    count(s.winner_side)::integer
  from bots b
  left join settled s on true
  group by b.nickname, b.strategy, b.ord
  order by 3 desc, b.ord;
$$;

revoke all on function public.sample_league_standings(integer) from public;
grant execute on function public.sample_league_standings(integer) to anon, authenticated;
