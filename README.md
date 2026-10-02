# Baseline Today

ATP and WTA singles rankings, player profiles with credited photos, accent-insensitive search, and
favorites with Google sign-in. A ground-up rebuild of my 2022 Flask tennis forum.

**Live:** _coming with the first deploy_ · [![CI](https://github.com/brandontaylor156/baseline-today/actions/workflows/ci.yml/badge.svg)](https://github.com/brandontaylor156/baseline-today/actions/workflows/ci.yml)

<p>
  <img src="docs/screenshots/rankings-desktop.png" alt="ATP rankings on desktop" width="62%">
  <img src="docs/screenshots/player-mobile-dark.png" alt="Player page on mobile in dark mode" width="30%">
</p>

## Features

- **Rankings:** top 100 per tour with movement, country flags and a selector over stored weekly snapshots.
- **Player pages:** profile, current and best tracked rank, favorite count, and a freely licensed
  Wikimedia Commons photo with author and license, or an initials-and-flag avatar.
- **Search:** live suggestions as you type; "djokovic", "Đoković" and "DJOKOVIĆ" all match.
- **Favorites and "My players":** Google sign-in only. No passwords and no email sign-up, so nobody can
  use the site to send email.
- Mobile-first, dark mode, server rendered, keyboard and screen-reader friendly.

Live scores are planned for phase 2 (see [PLAN.md](PLAN.md)).

## How it works

```
BALLDONTLIE API ──┐                      ┌── Next.js pages (cached, ISR)
Wikidata/Commons ─┼─ daily Vercel Cron ─▶ Supabase Postgres ◀─┤
                  │   (1 run, ~4 calls)   (RLS on every table)└── browser: favorites (RLS)
```

- **Page visits never call the data provider.** A daily cron job stores a dated rankings snapshot,
  refreshes stale profiles (100 per request), and rechecks ~40 players' photos, all behind a database
  lock. Pages read Supabase through Next's data cache, and the job revalidates it after each sync.
- **The provider is swappable:** all BALLDONTLIE code lives in `src/lib/provider/` behind our own
  types, so pages and the database never see its response format.
- **Row level security:** tennis data is public-read and writable only by the server's secret key.
  `favorites` and `profiles` are owner-only. Favorite counts come from a `security definer` function
  that returns a number and never reveals who favorited.
- **Search:** a generated `search_name` column (`unaccent`, with Đ→dj) plus a trigram index, queried
  through an RPC that ranks prefix matches first.
- **Auth:** `@supabase/ssr` with session refresh in `proxy.ts` (skipped for visitors without a
  session) and `getClaims()` verification. Signed-in UI is a client island, so pages stay cacheable.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth) ·
Vercel (Hobby, Cron) · Vitest · Playwright · GitHub Actions

## Tests

| Layer | What | Where |
| --- | --- | --- |
| Unit (Vitest) | provider mapping, sync rows, formatting, flags, Wikimedia parsing, redirects | `src/**/*.test.ts` |
| Browser (Playwright) | rankings, 404s, no horizontal scroll at 360px, player pages, credits, search, signed-out flows, cron auth (desktop + mobile) | `e2e/` |
| Database | 15 RLS checks: cross-user favorites and profiles, anon access, write protection, sync lock | `supabase/tests/isolation.sql` |

CI runs all of them on every push. The isolation test runs against a throwaway local Supabase with
the repo's migrations.

## Development

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

| Command | |
| --- | --- |
| `npm run typecheck` · `lint` · `test` · `build` | the same checks as CI |
| `npm run test:e2e` | Playwright against `npm run build` output |
| `npm run sync:daily` | run the daily sync locally |
| `npm run sync:photos -- 200` | backfill Wikimedia photos |

Database schema: `supabase/migrations/` (idempotent SQL).

## Credits

Rankings and player data from [BALLDONTLIE](https://www.balldontlie.io). Not affiliated with the ATP
or WTA. Player photos from Wikimedia Commons, credited on each page and at `/credits`. Flags from
[flag-icons](https://github.com/lipis/flag-icons) (MIT).
