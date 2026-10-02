-- Watch parties: private rooms for a match. Members join by invite code with a nickname; the host
-- keeps score (or live data does). Chat and reactions travel over private Realtime channels and
-- are never stored. Calls ("who wins this set?") are stored per member. Idempotent.

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  match_id bigint not null references public.matches (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  -- { "points": [1,2,…], "firstServerA": true, "bestOf": 3 } — the scorekeeper's point log.
  state jsonb not null default '{"points": []}'::jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 20000),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '12 hours'
);
create index if not exists parties_host on public.parties (host_id, created_at);

create table if not exists public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,22}[A-Za-z0-9]$'),
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id),
  unique (party_id, nickname)
);
create index if not exists party_members_user on public.party_members (user_id);

-- Predictions in a room: who wins set N (key "set-1", "set-2", …) or the match ("match").
create table if not exists public.party_calls (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  call_key text not null check (call_key ~ '^(set-[1-5]|match)$'),
  side smallint not null check (side in (1, 2)),
  called_at timestamptz not null default now(),
  primary key (party_id, user_id, call_key)
);

create or replace function public.is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.party_members m join public.parties p on p.id = m.party_id
    where m.party_id = p_party_id and m.user_id = auth.uid() and p.ends_at > now()
  );
$$;
revoke all on function public.is_party_member(uuid) from public;
grant execute on function public.is_party_member(uuid) to authenticated;

alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_calls enable row level security;
revoke all on public.parties, public.party_members, public.party_calls from anon, authenticated;
grant select, update (state), delete on public.parties to authenticated;
grant select, delete on public.party_members to authenticated;
grant select, insert, update (side, called_at), delete on public.party_calls to authenticated;

drop policy if exists "Members see their parties" on public.parties;
create policy "Members see their parties" on public.parties for select to authenticated using (public.is_party_member(id));
drop policy if exists "Hosts keep score" on public.parties;
create policy "Hosts keep score" on public.parties for update to authenticated
  using ((select auth.uid()) = host_id and ends_at > now()) with check ((select auth.uid()) = host_id);
drop policy if exists "Hosts end parties" on public.parties;
create policy "Hosts end parties" on public.parties for delete to authenticated using ((select auth.uid()) = host_id);

drop policy if exists "Members see each other" on public.party_members;
create policy "Members see each other" on public.party_members for select to authenticated using (public.is_party_member(party_id));
-- Leave yourself, or (host) remove someone.
drop policy if exists "Leave or remove" on public.party_members;
create policy "Leave or remove" on public.party_members for delete to authenticated using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.parties p where p.id = party_id and p.host_id = (select auth.uid()))
);

drop policy if exists "Members see calls" on public.party_calls;
create policy "Members see calls" on public.party_calls for select to authenticated using (public.is_party_member(party_id));
drop policy if exists "Members make calls" on public.party_calls;
create policy "Members make calls" on public.party_calls for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_party_member(party_id));
drop policy if exists "Members change calls" on public.party_calls;
create policy "Members change calls" on public.party_calls for update to authenticated
  using ((select auth.uid()) = user_id and public.is_party_member(party_id)) with check ((select auth.uid()) = user_id);
drop policy if exists "Members withdraw calls" on public.party_calls;
create policy "Members withdraw calls" on public.party_calls for delete to authenticated using ((select auth.uid()) = user_id);

-- Starts a party for a match (the caller hosts); returns the invite code.
create or replace function public.create_party(p_match_id bigint, p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
  pid uuid;
  five boolean;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.parties where host_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'party limit reached' using errcode = '54000';
  end if;
  select m.tour = 'atp' and coalesce(t.category, '') ilike '%grand slam%' into five
  from public.matches m join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id and m.confirmed;
  if five is null then raise exception 'no such match' using errcode = 'P0002'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.parties (code, match_id, host_id, state)
  values (code, p_match_id, auth.uid(), jsonb_build_object('points', '[]'::jsonb, 'firstServerA', true, 'bestOf', case when five then 5 else 3 end))
  returning id into pid;
  insert into public.party_members (party_id, user_id, nickname) values (pid, auth.uid(), trim(p_nickname));
  return code;
end $$;
revoke all on function public.create_party(bigint, text) from public;
grant execute on function public.create_party(bigint, text) to authenticated;

-- Joins (or renames yourself in) a live party; returns its id.
create or replace function public.join_party(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id into pid from public.parties where code = upper(trim(p_code)) and ends_at > now();
  if pid is null then raise exception 'no live party with that code' using errcode = 'P0002'; end if;
  if (select count(*) from public.party_members where party_id = pid) >= 50 then
    raise exception 'party is full' using errcode = '54000';
  end if;
  insert into public.party_members (party_id, user_id, nickname) values (pid, auth.uid(), trim(p_nickname))
  on conflict (party_id, user_id) do update set nickname = excluded.nickname;
  return pid;
end $$;
revoke all on function public.join_party(text, text) from public;
grant execute on function public.join_party(text, text) to authenticated;

-- Realtime: only members may send or receive on their party's private channel ("party:<id>").
drop policy if exists "Party members receive" on realtime.messages;
create policy "Party members receive" on realtime.messages for select to authenticated using (
  realtime.topic() like 'party:%'
  and public.is_party_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
);
drop policy if exists "Party members send" on realtime.messages;
create policy "Party members send" on realtime.messages for insert to authenticated with check (
  realtime.topic() like 'party:%'
  and public.is_party_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
);
