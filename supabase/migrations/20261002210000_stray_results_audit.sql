-- Audit helpers (server only): results shown under a tournament but taken from a draw page that
-- isn't the tournament's current page, and a fix that hides them. Idempotent.
create or replace function public.stray_wiki_results()
returns table (tournament_id bigint, season integer, name text, results bigint)
language sql
stable
set search_path = ''
as $$
  select t.id, t.season, t.name, count(*)
  from public.matches m
  join public.wiki_draws d on d.tournament_id = m.tournament_id
  join public.tournaments t on t.id = m.tournament_id
  where m.provider = 'wikipedia' and m.confirmed and d.status = 'found' and m.source_url is distinct from d.page_url
  group by t.id, t.season, t.name
  order by t.season, t.name;
$$;

create or replace function public.hide_stray_wiki_results()
returns integer
language sql
set search_path = ''
as $$
  with h as (
    update public.matches m set confirmed = false
    from public.wiki_draws d
    where d.tournament_id = m.tournament_id and m.provider = 'wikipedia' and m.confirmed
      and d.status = 'found' and m.source_url is distinct from d.page_url
    returning 1
  )
  select count(*)::integer from h;
$$;

revoke all on function public.stray_wiki_results() from public, anon, authenticated;
revoke all on function public.hide_stray_wiki_results() from public, anon, authenticated;
grant execute on function public.stray_wiki_results() to service_role;
grant execute on function public.hide_stray_wiki_results() to service_role;
