-- Draw luck: each champion's chance of beating the opponents they actually met. Idempotent.
alter table public.lab_title_chances add column if not exists path_chance real;

-- Champions whose path was easiest (path ÷ title chance highest) or hardest (lowest).
create or replace function public.lab_draw_luck(p_tour text, p_easiest boolean, p_limit integer default 12)
returns table (tournament_id bigint, tournament text, season integer, player_id bigint, name text, country text, chance real, path_chance real)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, t.season, c.player_id, coalesce(p.full_name, initcap(substr(c.player_key, 6))), p.country_code, c.chance, c.path_chance
  from public.lab_title_chances c
  join public.tournaments t on t.id = c.tournament_id
  left join public.players p on p.id = c.player_id
  where t.tour = p_tour and c.champion and c.path_chance is not null and c.chance >= 0.01
    and (t.category ilike '%grand slam%' or t.category ilike '%1000%' or t.category ilike '%500%')
  order by case when p_easiest then -(c.path_chance / c.chance) else c.path_chance / c.chance end
  limit p_limit;
$$;
revoke all on function public.lab_draw_luck(text, boolean, integer) from public;
grant execute on function public.lab_draw_luck(text, boolean, integer) to anon, authenticated;
