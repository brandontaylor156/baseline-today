-- Real-world conditions, from open data: each venue's coordinates, elevation and time zone
-- (Open-Meteo geocoding, GeoNames data, CC BY 4.0), whether each event was played indoors (its
-- Wikipedia article's infobox), and the weather during it (Open-Meteo historical archive, ERA5
-- reanalysis, CC BY 4.0).

create table if not exists public.venues (
  location text primary key,
  name text,
  latitude real,
  longitude real,
  elevation real,
  timezone text,
  country_code text,
  checked_at timestamptz not null default now()
);

create table if not exists public.event_conditions (
  tournament_id bigint primary key references public.tournaments (id) on delete cascade,
  indoor boolean,
  article text,
  -- Daily means over the event: maximum temperature, maximum apparent ("feels like") temperature, max wind, rain.
  temp_max real,
  apparent_max real,
  wind_max real,
  precipitation real,
  checked_at timestamptz not null default now()
);

alter table public.venues enable row level security;
alter table public.event_conditions enable row level security;
drop policy if exists "venues readable" on public.venues;
create policy "venues readable" on public.venues for select to anon, authenticated using (true);
drop policy if exists "event_conditions readable" on public.event_conditions;
create policy "event_conditions readable" on public.event_conditions for select to anon, authenticated using (true);
