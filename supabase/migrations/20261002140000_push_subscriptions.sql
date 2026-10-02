-- Push notifications for favorite players. Subscriptions belong to their owner (saved through
-- save_push_subscription, removed directly); the server sends with the secret key. Idempotent.

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- One row per browser: re-subscribing from another account moves the row.
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users read their own push subscriptions" on public.push_subscriptions;
create policy "Users read their own push subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users remove their own push subscriptions" on public.push_subscriptions;
create policy "Users remove their own push subscriptions" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Saves the caller's browser subscription. A browser has one endpoint, so signing in with another
-- account on the same browser moves the row to that account (the old owner stops getting pushes
-- there, which is what they'd expect).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- When fans were told about a result. Results already stored count as told, so turning this on
-- never sends a backlog.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'notified_at'
  ) then
    alter table public.matches add column notified_at timestamptz;
    update public.matches set notified_at = now();
  end if;
end $$;

create index if not exists matches_to_notify on public.matches (score_changed_at)
  where notified_at is null and status = 'final' and confirmed;
