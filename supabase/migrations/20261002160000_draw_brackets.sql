-- Each draw page's bracket layout, for title odds: { "size": 32, "lines": [{ "p": 0, "name": …,
-- "id": …, "country": …, "seed": … }] }. { "size": 0 } when the page's layout couldn't be read.
-- Public read like the rest of wiki_draws; written by the server. Idempotent.
alter table public.wiki_draws add column if not exists bracket jsonb;
