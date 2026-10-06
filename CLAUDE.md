@AGENTS.md

# Baseline Today

Tennis rankings, player pages, search, favorites and (Phase B) live scores. Portfolio project.
The full plan and the decisions behind it are in `PLAN.md`; read it before larger changes.

## Stack

Next.js (App Router, `src/`) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, RLS) · Vercel Hobby.

## Commands

- `npm run dev`: local dev server
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: the same checks CI runs

## Rules

- **Provider calls only in `src/lib/provider/`**, behind our own types. Pages, components and the
  database never see BALLDONTLIE response shapes.
- **Page visits never call the provider.** Rankings, player pages, search and favorites read from
  Supabase only. The only exceptions are the daily cron job and (Phase B) the locked live-score refresh.
- **Secrets:** `SUPABASE_SECRET_KEY`, `BALLDONTLIE_API_KEY` and `CRON_SECRET` are server-only. Never
  import them from client components and never prefix them `NEXT_PUBLIC_`. `.env*` stays gitignored.
- **Schema changes go in `supabase/migrations/`** as idempotent SQL, with RLS on every table.
- **Wording:** never call the data "official" (BALLDONTLIE terms).
- **Photos:** only freely licensed Wikimedia Commons images, always stored and shown with author,
  license and source link. Otherwise use the initials-and-flag avatar.
- **Auth:** Google sign-in only, using the `@supabase/ssr` pattern (proxy refresh + `getClaims()`).
- **Heavy test runs never target production.** Lighthouse, screenshot scripts, the full Playwright
  suite, axe scans and the party UI test run against a local production build (`npm run build`,
  then `npx next start`) or a Vercel preview deployment, never `https://baseline-today.vercel.app`.
  A quick single-request smoke check after a deploy is fine. Local and preview servers still read the
  shared Supabase project, so run heavy suites one at a time and not while CI is building.
