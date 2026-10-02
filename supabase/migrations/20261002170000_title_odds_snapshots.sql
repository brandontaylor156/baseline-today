-- Title chances over a tournament: a snapshot whenever results move them. odds = { "<player key>":
-- 0.2312, … } for players still in contention. Public read, server write. Idempotent.
create table if not exists public.title_odds_snapshots (
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  taken_at timestamptz not null default now(),
  odds jsonb not null,
  primary key (tournament_id, taken_at)
);

alter table public.title_odds_snapshots enable row level security;
revoke all on public.title_odds_snapshots from anon, authenticated;
grant select on public.title_odds_snapshots to anon, authenticated;

drop policy if exists "Title odds history is public" on public.title_odds_snapshots;
create policy "Title odds history is public" on public.title_odds_snapshots
  for select to anon, authenticated using (true);
