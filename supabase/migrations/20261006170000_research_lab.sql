-- Research lab: pre-tournament title chances for every reconstructed draw, weekly ratings for every
-- player, and the leaderboards built on them. Written by the lab job (service role); public read.
-- Idempotent.

create table if not exists public.lab_title_chances (
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  player_key text not null,
  player_id bigint references public.players (id) on delete set null,
  chance real not null,
  champion boolean not null,
  rating integer,
  primary key (tournament_id, player_key)
);
create index if not exists lab_title_chances_player on public.lab_title_chances (player_id);

create table if not exists public.lab_ratings (
  player_key text not null,
  player_id bigint references public.players (id) on delete set null,
  tour text not null,
  week date not null,
  overall real not null,
  hard real not null,
  clay real not null,
  grass real not null,
  matches integer not null,
  primary key (player_key, week)
);
create index if not exists lab_ratings_player on public.lab_ratings (player_id, week);
create index if not exists lab_ratings_tour_week on public.lab_ratings (tour, week);

alter table public.lab_title_chances enable row level security;
alter table public.lab_ratings enable row level security;
revoke all on public.lab_title_chances, public.lab_ratings from anon, authenticated;
grant select on public.lab_title_chances, public.lab_ratings to anon, authenticated;
drop policy if exists "Lab title chances are public" on public.lab_title_chances;
create policy "Lab title chances are public" on public.lab_title_chances for select to anon, authenticated using (true);
drop policy if exists "Lab ratings are public" on public.lab_ratings;
create policy "Lab ratings are public" on public.lab_ratings for select to anon, authenticated using (true);

-- Expected titles (sum of pre-tournament chances) against actual titles, per player.
create or replace function public.lab_luck(p_tour text, p_since integer default 2015)
returns table (player_id bigint, name text, country text, entries integer, expected real, titles integer, finals_reached integer)
language sql
stable
set search_path = ''
as $$
  select c.player_id, p.full_name, p.country_code, count(*)::integer, sum(c.chance)::real, count(*) filter (where c.champion)::integer, 0
  from public.lab_title_chances c
  join public.tournaments t on t.id = c.tournament_id
  join public.players p on p.id = c.player_id
  where t.tour = p_tour and t.season >= p_since
  group by c.player_id, p.full_name, p.country_code
  having sum(c.chance) >= 0.5 or count(*) filter (where c.champion) > 0;
$$;

-- Titles won from the longest odds, and the strongest favourites who didn't win.
create or replace function public.lab_title_extremes(p_tour text, p_champions boolean, p_limit integer default 15)
returns table (tournament_id bigint, tournament text, category text, season integer, player_id bigint, name text, country text, chance real)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, t.category, t.season, c.player_id, coalesce(p.full_name, initcap(substr(c.player_key, 6))), p.country_code, c.chance
  from public.lab_title_chances c
  join public.tournaments t on t.id = c.tournament_id
  left join public.players p on p.id = c.player_id
  where t.tour = p_tour and c.champion = p_champions
  order by case when p_champions then c.chance else -c.chance end
  limit p_limit;
$$;

-- Each player's peak overall rating and when it happened (players with 40+ matches).
create or replace function public.lab_peaks(p_tour text, p_limit integer default 25)
returns table (player_id bigint, name text, country text, peak real, week date, hard real, clay real, grass real)
language sql
stable
set search_path = ''
as $$
  select distinct on (r.player_id) r.player_id, p.full_name, p.country_code, r.overall, r.week, r.hard, r.clay, r.grass
  from public.lab_ratings r
  join public.players p on p.id = r.player_id
  where r.tour = p_tour and r.matches >= 40
  order by r.player_id, r.overall desc
$$;

-- Aging curve by the delta method: for each age, the average change in the same players' rating
-- from that age to the next, measured against that year's field (so rating drift across seasons
-- doesn't count as improvement). 2015–16 are skipped while ratings settle from the 1500 start.
-- Each player-age uses their average rating over the year; 20+ matches in both years.
drop function if exists public.lab_aging(text);
create or replace function public.lab_aging(p_tour text)
returns table (age integer, players integer, delta real)
language sql
stable
set search_path = ''
as $$
  with weeks as (
    select r.player_id, r.week, r.overall, r.matches, p.birth_date
    from public.lab_ratings r
    join public.players p on p.id = r.player_id
    where r.tour = p_tour and r.week >= date '2017-01-01'
  ),
  field as (
    -- The field's average rating each calendar year (players with 20+ matches that year).
    select y, avg(rating) as mean from (
      select player_id, extract(year from week)::integer as y, avg(overall) as rating, max(matches) - min(matches) as played
      from weeks group by player_id, 2
    ) x where played >= 20 group by y
  ),
  yearly as (
    select w.player_id, (extract(year from age(w.week, w.birth_date)))::integer as age,
      avg(w.overall - f.mean) as rel, max(w.matches) - min(w.matches) as played
    from weeks w
    join field f on f.y = extract(year from w.week)::integer
    where w.birth_date is not null
    group by w.player_id, 2
  )
  select a.age, count(*)::integer, avg(b.rel - a.rel)::real
  from yearly a
  join yearly b on b.player_id = a.player_id and b.age = a.age + 1
  where a.played >= 20 and b.played >= 20 and a.age between 16 and 38
  group by a.age
  having count(*) >= 8
  order by a.age;
$$;

revoke all on function public.lab_luck(text, integer) from public;
revoke all on function public.lab_title_extremes(text, boolean, integer) from public;
revoke all on function public.lab_peaks(text, integer) from public;
revoke all on function public.lab_aging(text) from public;
grant execute on function public.lab_luck(text, integer) to anon, authenticated;
grant execute on function public.lab_title_extremes(text, boolean, integer) to anon, authenticated;
grant execute on function public.lab_peaks(text, integer) to anon, authenticated;
grant execute on function public.lab_aging(text) to anon, authenticated;
