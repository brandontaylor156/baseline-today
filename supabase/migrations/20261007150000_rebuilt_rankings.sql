-- Rankings rebuilt from results: each player's points from each tracked event (our points table),
-- and a function that adds up the best results of the 52 weeks to any date, optionally without
-- one tournament ("what if").

create table if not exists public.ranking_points (
  tour text not null,
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  player_key text not null,
  player_id bigint references public.players (id) on delete set null,
  name text not null,
  country text,
  category text not null,
  end_date date not null,
  points integer not null,
  primary key (tournament_id, player_key)
);
create index if not exists ranking_points_tour_date on public.ranking_points (tour, end_date);

alter table public.ranking_points enable row level security;
drop policy if exists "ranking_points readable" on public.ranking_points;
create policy "ranking_points readable" on public.ranking_points for select to anon, authenticated using (true);

create or replace function public.rebuilt_ranking(p_tour text, p_date date, p_exclude bigint default null, p_best integer default 19, p_limit integer default 100)
returns table (rank integer, player_key text, player_id bigint, name text, country text, points integer, events integer)
language sql
stable
set search_path = ''
as $$
  with window_results as (
    select rp.*, row_number() over (partition by rp.player_key order by rp.points desc) as n
    from public.ranking_points rp
    where rp.tour = p_tour and rp.end_date <= p_date and rp.end_date > p_date - 364
      and (p_exclude is null or rp.tournament_id <> p_exclude)
  ),
  totals as (
    select player_key, max(player_id) as player_id, max(name) as name, max(country) as country,
      sum(points) filter (where n <= p_best)::integer as points, count(*)::integer as events
    from window_results group by player_key
  )
  select (rank() over (order by points desc))::integer, player_key, player_id, name, country, points, events
  from totals where points > 0 order by points desc limit p_limit;
$$;
revoke all on function public.rebuilt_ranking(text, date, bigint, integer, integer) from public;
grant execute on function public.rebuilt_ranking(text, date, bigint, integer, integer) to anon, authenticated;

-- Season finals results are stored even when the calendar has no row for that year's event
-- (ATP Finals before 2026 use tournament_id = -season), so no foreign key on the tournament.
alter table public.ranking_points drop constraint if exists ranking_points_tournament_id_fkey;
