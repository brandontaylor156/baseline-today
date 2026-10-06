-- Birth dates for players known only by name (most of the draw), from their Wikipedia article's
-- Wikidata item (CC0). Feeds the aging curves and career comparables.

create table if not exists public.lab_people (
  player_key text primary key,
  tour text not null,
  name text not null,
  wikidata_id text,
  birth_date date,
  checked_at timestamptz not null default now()
);
alter table public.lab_people add column if not exists country text;

alter table public.lab_people enable row level security;
drop policy if exists "lab_people readable" on public.lab_people;
create policy "lab_people readable" on public.lab_people for select to anon, authenticated using (true);

-- Every spelling of an unlinked player's name, with how often it appears (the sync picks the most
-- common) and the country the draws most often give.
drop function if exists public.lab_unlinked_names();
create function public.lab_unlinked_names()
returns table (tour text, name text, country text, n integer)
language sql
stable
set search_path = ''
as $$
  select tour, name, mode() within group (order by country), count(*)::integer from (
    select tour, player1_name as name, player1_country as country from public.matches where player1_id is null and player1_name is not null and confirmed
    union all
    select tour, player2_name, player2_country from public.matches where player2_id is null and player2_name is not null and confirmed
  ) x group by 1, 2;
$$;
revoke all on function public.lab_unlinked_names() from public, anon, authenticated;
grant execute on function public.lab_unlinked_names() to service_role;

-- A rated player's birth date: our player record, else the Wikidata lookup.
create or replace function public.lab_birth_dates(p_tour text)
returns table (player_key text, birth_date date)
language sql
stable
set search_path = ''
as $$
  select distinct r.player_key, coalesce(p.birth_date, lp.birth_date)
  from public.lab_ratings r
  left join public.players p on p.id = r.player_id
  left join public.lab_people lp on lp.player_key = r.player_key
  where r.tour = p_tour and coalesce(p.birth_date, lp.birth_date) is not null;
$$;
revoke all on function public.lab_birth_dates(text) from public;
grant execute on function public.lab_birth_dates(text) to anon, authenticated;

create or replace function public.lab_aging(p_tour text)
returns table (age integer, players integer, delta real)
language sql
stable
set search_path = ''
as $$
  with weeks as (
    select r.player_key, r.week, r.overall, r.matches, coalesce(p.birth_date, lp.birth_date) as birth_date
    from public.lab_ratings r
    left join public.players p on p.id = r.player_id
    left join public.lab_people lp on lp.player_key = r.player_key
    where r.tour = p_tour and r.week >= date '2017-01-01'
  ),
  field as (
    -- The field's average rating each calendar year (players with 20+ matches that year).
    select y, avg(rating) as mean from (
      select player_key, extract(year from week)::integer as y, avg(overall) as rating, max(matches) - min(matches) as played
      from weeks group by player_key, 2
    ) x where played >= 20 group by y
  ),
  yearly as (
    select w.player_key, (extract(year from age(w.week, w.birth_date)))::integer as age,
      avg(w.overall - f.mean) as rel, max(w.matches) - min(w.matches) as played
    from weeks w
    join field f on f.y = extract(year from w.week)::integer
    where w.birth_date is not null
    group by w.player_key, 2
  )
  select a.age, count(*)::integer, avg(b.rel - a.rel)::real
  from yearly a
  join yearly b on b.player_key = a.player_key and b.age = a.age + 1
  where a.played >= 20 and b.played >= 20 and a.age between 16 and 38
  group by a.age
  having count(*) >= 8
  order by a.age;
$$;
