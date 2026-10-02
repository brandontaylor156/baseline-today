-- Read-only helpers for pages. Security invoker: they see exactly what the caller's RLS allows.

-- Stored snapshot dates for a tour, newest first (PostgREST has no DISTINCT).
create or replace function public.ranking_dates(p_tour text)
returns setof date
language sql
stable
set search_path = ''
as $$
  select distinct ranking_date from public.rankings where tour = p_tour order by ranking_date desc
$$;

-- Accent-insensitive player search, best matches first: name starts with the query, then any
-- word starts with it, then substring/fuzzy matches; ties broken by current ranking.
create or replace function public.search_players(p_query text, p_limit integer default 10)
returns table (
  id bigint,
  tour text,
  full_name text,
  country_code text,
  current_rank integer
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      public.search_normalize(btrim(p_query)) as term,
      replace(replace(replace(public.search_normalize(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  ),
  latest as (
    select tour, max(ranking_date) as ranking_date from public.rankings group by tour
  )
  select p.id, p.tour, p.full_name, p.country_code, r.rank as current_rank
  from public.players p
  cross join q
  left join latest l on l.tour = p.tour
  left join public.rankings r
    on r.player_id = p.id and r.tour = p.tour and r.ranking_date = l.ranking_date
  where char_length(q.term) >= 2
    and (
      p.search_name like '%' || q.pattern || '%'
      or extensions.similarity(p.search_name, q.term) > 0.35
    )
  order by
    case
      when p.search_name like q.pattern || '%' then 0
      when p.search_name like '% ' || q.pattern || '%' then 1
      when p.search_name like '%' || q.pattern || '%' then 2
      else 3
    end,
    r.rank nulls last,
    p.full_name
  limit least(greatest(p_limit, 1), 50)
$$;

grant execute on function public.ranking_dates(text) to anon, authenticated;
grant execute on function public.search_players(text, integer) to anon, authenticated;
