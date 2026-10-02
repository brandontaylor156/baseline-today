-- A tournament row is one season's edition. BALLDONTLIE reuses the same tournament id every
-- year (Australian Open = 225 in 2024 and 2026), so the provider id alone is not unique.
-- Idempotent.

alter table public.tournaments drop constraint if exists tournaments_provider_tour_provider_id_key;
create unique index if not exists tournaments_edition_unique
  on public.tournaments (provider, tour, provider_id, season);
