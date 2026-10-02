-- Short AI-written recaps of big matches (finals and semifinals), generated from our own match data
-- when enabled. Public read, server write. Idempotent.
create table if not exists public.match_recaps (
  match_id bigint primary key references public.matches (id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  model text not null,
  created_at timestamptz not null default now()
);
create index if not exists match_recaps_created on public.match_recaps (created_at);

alter table public.match_recaps enable row level security;
revoke all on public.match_recaps from anon, authenticated;
grant select on public.match_recaps to anon, authenticated;

drop policy if exists "Recaps are public" on public.match_recaps;
create policy "Recaps are public" on public.match_recaps for select to anon, authenticated using (true);
