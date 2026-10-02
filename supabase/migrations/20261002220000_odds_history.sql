-- Price history per bookmaker, a row whenever a price changes (for odds-movement charts). Public
-- read, server write. Idempotent.
create table if not exists public.odds_history (
  match_id bigint not null references public.matches (id) on delete cascade,
  vendor text not null,
  taken_at timestamptz not null default now(),
  player1_odds integer,
  player2_odds integer,
  primary key (match_id, vendor, taken_at)
);

alter table public.odds_history enable row level security;
revoke all on public.odds_history from anon, authenticated;
grant select on public.odds_history to anon, authenticated;

drop policy if exists "Odds history is public" on public.odds_history;
create policy "Odds history is public" on public.odds_history for select to anon, authenticated using (true);
