-- Clutch index: tiebreaks and deciding sets won against what the point-level model expected for
-- each matchup. Written by the lab job; public read. Idempotent.
create table if not exists public.lab_clutch (
  player_key text primary key,
  player_id bigint references public.players (id) on delete set null,
  tour text not null,
  tb_n integer not null,
  tb_won integer not null,
  tb_expected real not null,
  tb_variance real not null,
  dec_n integer not null,
  dec_won integer not null,
  dec_expected real not null,
  dec_variance real not null
);
create index if not exists lab_clutch_player on public.lab_clutch (player_id);
alter table public.lab_clutch enable row level security;
revoke all on public.lab_clutch from anon, authenticated;
grant select on public.lab_clutch to anon, authenticated;
drop policy if exists "Lab clutch is public" on public.lab_clutch;
create policy "Lab clutch is public" on public.lab_clutch for select to anon, authenticated using (true);
