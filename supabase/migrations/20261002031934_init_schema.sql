-- Baseline Today: core schema (Phase A). Idempotent: safe to run more than once.
-- Tennis data is public-read and written only by the server (secret key, which bypasses RLS).
-- profiles and favorites belong to their owner. Matches arrive in a Phase B migration.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() is only STABLE; this wrapper pins the dictionary so it can back a generated column.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

-- Search key: lower case, accents removed. Đ/đ become "dj" (Serbian/Croatian), not unaccent's "d",
-- so "djokovic" finds Đoković. Used for stored names and for search input alike.
create or replace function public.search_normalize(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(public.immutable_unaccent(replace(replace(value, chr(272), 'Dj'), chr(273), 'dj')))  -- Đ, đ
$$;

-- ---------------------------------------------------------------------------
-- Tennis data
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id bigint generated always as identity primary key,
  tour text not null check (tour in ('atp', 'wta')),
  provider text not null default 'balldontlie',
  provider_id bigint not null,
  first_name text,
  last_name text,
  full_name text not null,
  country_code text,
  country_name text,
  birth_place text,
  plays text,
  height_cm integer,
  weight_kg integer,
  birth_date date,
  turned_pro integer,
  wikidata_id text,
  profile_refreshed_at timestamptz,
  image_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, tour, provider_id)
);

alter table public.players
  add column if not exists search_name text generated always as (public.search_normalize(full_name)) stored;

create index if not exists players_search_name_trgm
  on public.players using gin (search_name extensions.gin_trgm_ops);
create index if not exists players_profile_refreshed_at
  on public.players (profile_refreshed_at nulls first);

create table if not exists public.rankings (
  tour text not null check (tour in ('atp', 'wta')),
  ranking_date date not null,
  player_id bigint not null references public.players (id) on delete cascade,
  rank integer not null check (rank > 0),
  points integer,
  movement integer,
  primary key (tour, ranking_date, player_id)
);

create index if not exists rankings_tour_date_rank on public.rankings (tour, ranking_date desc, rank);
create index if not exists rankings_player on public.rankings (player_id, ranking_date desc);

create table if not exists public.player_images (
  player_id bigint primary key references public.players (id) on delete cascade,
  image_url text not null,
  source_url text not null,
  author text not null,
  license text not null,
  license_url text,
  fetched_at timestamptz not null default now()
);

create table if not exists public.sync_state (
  key text primary key,
  last_refreshed_at timestamptz,
  status text,
  details jsonb,
  locked_until timestamptz
);

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

create index if not exists favorites_player on public.favorites (player_id);

-- Create a profile for every new user, named from their Google account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.players enable row level security;
alter table public.rankings enable row level security;
alter table public.player_images enable row level security;
alter table public.sync_state enable row level security;
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;

revoke all on public.players, public.rankings, public.player_images, public.sync_state,
  public.profiles, public.favorites from anon, authenticated;

grant select on public.players, public.rankings, public.player_images, public.sync_state
  to anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;

drop policy if exists "Tennis data is public" on public.players;
create policy "Tennis data is public" on public.players
  for select to anon, authenticated using (true);

drop policy if exists "Tennis data is public" on public.rankings;
create policy "Tennis data is public" on public.rankings
  for select to anon, authenticated using (true);

drop policy if exists "Tennis data is public" on public.player_images;
create policy "Tennis data is public" on public.player_images
  for select to anon, authenticated using (true);

drop policy if exists "Sync status is public" on public.sync_state;
create policy "Sync status is public" on public.sync_state
  for select to anon, authenticated using (true);

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users read their own favorites" on public.favorites;
create policy "Users read their own favorites" on public.favorites
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own favorites" on public.favorites;
create policy "Users add their own favorites" on public.favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users remove their own favorites" on public.favorites;
create policy "Users remove their own favorites" on public.favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Public favorite count without exposing who favorited.
create or replace function public.player_favorite_count(p_player_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.favorites where player_id = p_player_id
$$;

revoke all on function public.player_favorite_count(bigint) from public;
grant execute on function public.player_favorite_count(bigint) to anon, authenticated;

-- Take the refresh lock for a sync key if it is free or expired. Returns true if acquired.
-- Server only: the cron job and (Phase B) the live-score refresh.
create or replace function public.try_acquire_sync_lock(p_key text, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean;
begin
  insert into public.sync_state (key) values (p_key) on conflict (key) do nothing;

  update public.sync_state
  set locked_until = now() + make_interval(secs => p_ttl_seconds)
  where key = p_key and (locked_until is null or locked_until < now())
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

revoke all on function public.try_acquire_sync_lock(text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_sync_lock(text, integer) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
