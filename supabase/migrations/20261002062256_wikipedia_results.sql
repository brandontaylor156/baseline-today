-- Results from Wikipedia draw pages (CC BY-SA 4.0), stored in matches with provider 'wikipedia'.
-- Idempotent.

alter table public.matches
  add column if not exists player1_name text,
  add column if not exists player2_name text,
  add column if not exists player1_country text,
  add column if not exists player2_country text,
  add column if not exists winner_side smallint check (winner_side in (1, 2)),
  -- Safeguard: a Wikipedia result is shown only once its page has been stable for a while.
  add column if not exists confirmed boolean not null default true,
  -- Page the result came from (credit link), and its identity on that page.
  add column if not exists source_url text,
  add column if not exists source_key text;

create index if not exists matches_results
  on public.matches (tournament_id) where status = 'final' and confirmed;

-- Which Wikipedia draw page belongs to which tournament, and the last revision we read.
create table if not exists public.wiki_draws (
  tournament_id bigint primary key references public.tournaments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'found', 'not_found')),
  page_title text,
  page_url text,
  last_revid bigint,
  last_rev_at timestamptz,
  checked_at timestamptz,
  discovered_at timestamptz,
  note text
);

-- Backstop: one page belongs to one tournament.
create unique index if not exists wiki_draws_page_unique on public.wiki_draws (page_title) where status = 'found';

alter table public.wiki_draws enable row level security;
revoke all on public.wiki_draws from anon, authenticated;
grant select on public.wiki_draws to anon, authenticated;

drop policy if exists "Draw sources are public" on public.wiki_draws;
create policy "Draw sources are public" on public.wiki_draws
  for select to anon, authenticated using (true);
