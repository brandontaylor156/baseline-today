-- "Who stood in whose way": expected titles each rival gained, summed over every rebuilt draw,
-- when a contender is replaced by a typical entrant. Written by the lab job; public read. Idempotent.
create table if not exists public.lab_denied (
  tour text not null,
  player_key text not null,
  other_key text not null,
  player_id bigint references public.players (id) on delete set null,
  other_id bigint references public.players (id) on delete set null,
  gain real not null,
  primary key (player_key, other_key)
);
create index if not exists lab_denied_player on public.lab_denied (player_id);
create index if not exists lab_denied_other on public.lab_denied (other_id);
alter table public.lab_denied enable row level security;
revoke all on public.lab_denied from anon, authenticated;
grant select on public.lab_denied to anon, authenticated;
drop policy if exists "Lab denied is public" on public.lab_denied;
create policy "Lab denied is public" on public.lab_denied for select to anon, authenticated using (true);

-- The biggest pairs, and per-player totals (titles cost to others, and cost by others).
create or replace function public.lab_denied_pairs(p_tour text, p_limit integer default 25)
returns table (player_id bigint, player text, player_country text, other_id bigint, other text, other_country text, gain real)
language sql
stable
set search_path = ''
as $$
  select d.player_id, a.full_name, a.country_code, d.other_id, b.full_name, b.country_code, d.gain
  from public.lab_denied d
  join public.players a on a.id = d.player_id
  join public.players b on b.id = d.other_id
  where d.tour = p_tour
  order by d.gain desc
  limit p_limit;
$$;

create or replace function public.lab_denied_totals(p_tour text)
returns table (player_id bigint, name text, country text, cost_others real, cost_by_others real)
language sql
stable
set search_path = ''
as $$
  with given as (select player_id, sum(gain) as g from public.lab_denied where tour = p_tour and player_id is not null group by 1),
  taken as (select other_id as player_id, sum(gain) as t from public.lab_denied where tour = p_tour and other_id is not null group by 1)
  select p.id, p.full_name, p.country_code, coalesce(g.g, 0)::real, coalesce(t.t, 0)::real
  from public.players p
  left join given g on g.player_id = p.id
  left join taken t on t.player_id = p.id
  where g.g is not null or t.t is not null;
$$;

revoke all on function public.lab_denied_pairs(text, integer) from public;
revoke all on function public.lab_denied_totals(text) from public;
grant execute on function public.lab_denied_pairs(text, integer) to anon, authenticated;
grant execute on function public.lab_denied_totals(text) to anon, authenticated;
