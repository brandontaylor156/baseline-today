# Baseline Today — Revamp Plan

*Written 2026-10-02. Status: approved plan, nothing built yet.*

Rebuild **Baseline Today** — the Flask tennis forum (rankings, player pages, live scores,
search, favorites) — as a modern **portfolio showcase** on **Next.js + TypeScript + Tailwind +
Supabase, deployed on Vercel**, in a **new GitHub repository with clean history**.

---

## Decisions (made)

| # | Decision |
|---|---|
| 1 | **Data provider: BALLDONTLIE** (ATP + WTA APIs). Phase A uses the **free tier only**. Whether to pay for live scores/matches ($9.99/month per tour) is decided **after the Phase B 48-hour trial**. |
| 2 | **Sign in with Google only.** No email codes or magic links — sign-up is open to anyone, so strangers must not be able to trigger emails. The Supabase **Email provider is turned off**. |
| 3 | **New public GitHub repo with clean history** for the revamp. The old repo gets a `v1-flask` tag and is then made **private** (this also takes the 982 old player photos out of public view, history included). |
| 4 | **Player photos:** credited Wikimedia Commons images where available, otherwise an initials-and-country-flag avatar. None of the old photos are carried over. |
| 5 | **Stack:** Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, row level security) + Vercel (Hobby). |
| 6 | **Goal:** portfolio showcase — polished, mobile-first, fast, free (or nearly free) to run, with tests and CI. |

---

## 1. Security check of the old repo (done)

- Scanned **all 22 commits** (every version of every text file) plus a direct history search;
  the scanner was verified against a planted fake key.
- **No API keys or passwords were ever committed.** The SportRadar key and MySQL password lived
  in `config.py`, which `.gitignore` always excluded. Nothing needs to be cancelled.
- **Weak spot:** the Flask app's session secret is hard-coded as `"secret"` (since commit
  `5bd8011`, 2022-09-04). Not an account credential — but **if the old Flask app is still deployed
  anywhere (the `Procfile` suggests Heroku), take it down**, since anyone could forge a login.
- The old SportRadar trial key would have expired after 30 days; SportRadar trial data also may
  not be displayed publicly, so it is not reused.

---

## 2. Tennis data provider

### Comparison (researched 2026-10-01/02; see notes on unverified items)

| Provider | Cost | Rankings | Profiles | Live | Match results | Store & show publicly? | Verdict |
|---|---|---|---|---|---|---|---|
| **BALLDONTLIE** ATP + WTA | **Free** (players, rankings, tournaments) · **$9.99/mo per tour** adds matches & live (ALL-STAR, 60 req/min) | ✓ | Partial | ✓ tour level | ✓ | **✓ explicitly** (cache, store, publish, display); no attribution | **Chosen** |
| Tennis-API.com (Matchstat) | $10/mo for 10k requests | ✓ | ✓ | ✓ incl. Challenger/ITF | ✓ | Terms unverified | Fallback (check terms first) |
| API-Tennis | $40/mo (14-day trial) | ✓ | Partial | ✓ incl. Challenger/ITF | ✓ | Not addressed; image URLs carry no rights | Best option just above budget |
| SportRadar | Trial free (30 days, 1k calls); paid by quote | ✓ best | ✓ best | ✓ | ✓ | **✗ trial terms forbid public display** | Not usable |
| Live Tennis API | Free 100/day | Unclear | ✓ | ✓ | Paid | **✗ limits storing data** | Conflicts with our caching |
| TennisApi1 (RapidAPI) | — | | | | | | **Avoid — reportedly scrapes SofaScore** |
| API-Sports, Sportmonks, TheSportsDB | — | No tennis rankings/live | | | | | Not viable |

Sources: balldontlie.io (pricing, terms), atp.balldontlie.io / wta.balldontlie.io (docs),
developer.sportradar.com (trial + master terms), tennis-api.com, api-tennis.com, livetennisapi.com.

### BALLDONTLIE — what we get and what we give up

- **Tiers (per tour — ATP and WTA are separate products):**
  - Free: Players, Tournaments, Rankings, 5 requests/min.
  - ALL-STAR $9.99/mo: adds **Matches** (incl. live: `is_live`, `status_state`, set/game scores), 60 requests/min.
  - GOAT $39.99/mo: adds match stats, player career stats, head-to-head.
  - 48-hour trial of paid tiers.
- **Gives up / caveats:**
  - Main ATP/WTA tour only — **no Challenger or ITF**.
  - **No career-high ranking**; career/season win-loss requires GOAT. → We compute **season W-L
    from the matches we store**, and show **"best ranking since tracking began"** from our own
    daily snapshots.
  - **Data source isn't disclosed**, and the terms forbid stating or implying the data is official.
    → The site never uses the word "official".
  - Live-score latency is **not documented** → measure during the Phase B trial.
- **To verify early (Phase A):** whether one free key covers both ATP and WTA ("1 sport" on the
  free tier — unverified). If not, Phase A ships ATP first or uses two free keys if allowed.
- **To verify in the Phase B trial:** live latency; how to query "today's matches" (no documented
  by-date filter — may need season + tournament queries); response shapes.
- **Swappable:** all provider calls live in `lib/provider/` behind our own types, so moving to
  Tennis-API.com or API-Tennis later doesn't touch pages or the database.

---

## 3. Keeping data fresh on free plans

**Constraint (Vercel docs):** Hobby cron jobs run **at most once per day**, within the scheduled
hour (±59 min). More frequent expressions fail to deploy.

### Daily job (Vercel Cron, ~06:00 UTC)
1. ATP + WTA rankings, top 100 each (~4 calls) → dated snapshot rows.
2. Upsert players; fetch profiles for new players.
3. (Phase B) Yesterday's + today's matches → builds each player's match history in our DB.
4. Rotating profile refresh: ~30 players/day, so all ~200 refresh weekly.
5. Protected by a `CRON_SECRET` header check; logs one summary line.

### Live scores — refresh on visit (free)
1. The scores page **always renders from our database** (instant).
2. If the saved live data is older than **2 minutes while matches are in progress** (15 minutes
   otherwise), the request schedules **one background refresh** (Next.js post-response work);
   the next view shows fresh data.
3. A **database lock** (conditional update on `sync_state`) ensures only one refresh runs at a
   time, no matter how many viewers → at most ~30 provider calls/hour per tour, and **zero when
   nobody is watching**.
4. While the page is open and visible, it re-checks every **60 seconds**.
5. Optional later: Supabase `pg_cron` (free) to refresh during tournament hours without visitors —
   off by default to save calls.

**Rule:** rankings, player pages, search and favorites **never call the provider** during a page
visit — only the live-score refresh does.

---

## 4. Supabase

- Free plan: **2 active projects**, counted across all organizations you own/admin; **paused
  projects don't count**. One Closet uses one → Baseline Today uses the **second (last) free slot**.
- **Tables:**
  - `players` (id, name, country, handedness, height, weight, birth date, turned pro, provider ids)
  - `rankings` (tour, ranking date, player, rank, points, movement) — daily snapshots
  - `matches` (tour, tournament, round, start time, status, score, players, winner) — Phase B
  - `player_images` (player, image URL, author, license, source page) — credited photos
  - `sync_state` (key, last refreshed, status, lock) — freshness + refresh lock
  - `profiles` (user id, display name) and `favorites` (user id, player id)
- **Row level security:** tennis data is readable by everyone, writable only by the server
  (secret key used only in cron/refresh routes, never in the browser). `profiles` and `favorites`
  are readable/writable only by their owner (favorite counts exposed via an aggregate view).
- **Schema as migrations** in the repo (`supabase/migrations/`), idempotent.
- **Isolation test** (like One Closet's): proves one user can't read or change another user's
  favorites or profile.

---

## 5. Sign-in — Google only

- **Sign in with Google** via Supabase Auth (needs a free Google Cloud OAuth client).
- **Email provider disabled** in Supabase → no emails can be triggered by anyone.
- Browsing is open to everyone; an account is needed only for favorites and "My players".
- Open sign-up is safe: no user action spends paid API calls (only the locked, rate-bounded
  live refresh does).
- Session handling follows Supabase's official `@supabase/ssr` Next.js pattern (proxy refresh +
  `getClaims()`), as in One Closet.

---

## 6. Player photos

- **Wikimedia Commons via Wikidata** (player's Wikidata "image" property): store the image URL
  with **author, license, and source link**; show the credit under the photo and on a
  **/credits** page. Only freely licensed images (e.g. CC BY, CC BY-SA, public domain).
- **No free photo → initials-and-flag avatar** (flag SVGs from an MIT-licensed set).
- Photo lookup runs in the daily job (rotating), never during a page visit.

---

## 7. Version 1 features (parity with the old app)

| Old app | New app |
|---|---|
| Top-100 rankings (men/women) | Same + movement arrows, country flags, date selector over stored snapshots |
| Player page (bio, W-L, recent matches, favorited by) | Bio, season W-L (from stored matches), recent results, best tracked ranking, credited photo or avatar, favorite count |
| Live & today's scores | Same, grouped by tournament, refreshed on visit (section 3) — Phase B |
| Live search | Accent-insensitive player search ("djokovic" finds Đoković) + today's matches |
| Register/login with password | Sign in with Google (no passwords stored) |
| Favorite players | Same + **"My players"**: favorites' upcoming and live matches |

**Portfolio polish:** mobile-first design, dark mode, server-rendered pages, accessible markup,
README with screenshots + live link, and **CI on GitHub** (type check, lint, Vitest unit tests,
Playwright browser tests, isolation test) on every push.

---

## 8. Repositories and order of work

### Repos
1. In the **old repo** (`brandontaylor156/baseline-today`): tag the current code **`v1-flask`**,
   push the tag, then rename it (suggested: `baseline-today-v1`) and make it **private**.
2. Create a **new public repo** (suggested name: `baseline-today`, freed by the rename) with
   clean history. Locally, rename the old folder (e.g. `Documents\baseline-today-v1`) and
   create the new app in `Documents\baseline-today`. Move this PLAN.md into the new repo as part
   of its first commit.

### Phase A — free
1. Next.js + TypeScript + Tailwind project; CLAUDE.md; CI skeleton.
2. Supabase project #2, migrations, row level security.
3. BALLDONTLIE free key(s); `lib/provider/` adapter; daily cron: rankings + players + profiles.
4. Pages: rankings, player pages (without match history yet), search.
5. Sign in with Google; favorites; "My players" (rankings/profile view until Phase B).
6. Avatars + credited Wikimedia photos; /credits page.
7. Tests (unit, browser, isolation); deploy to a **new Vercel project**.

### Phase B — trial, then decide
1. Start the BALLDONTLIE **48-hour ALL-STAR trial**; measure live latency and how to fetch
   today's matches.
2. **Decision point:** pay $9.99/month per tour (ATP + WTA = $19.98) or not.
3. If yes: matches in the daily job, scores page, on-visit live refresh with lock, recent results,
   season W-L, "My players" live/upcoming.
4. If no: keep Phase A live; consider Tennis-API.com ($10/mo) after reading its terms.

### Dashboard steps for Brandon (walked through when reached)
- BALLDONTLIE account + API key(s)
- Supabase: create project #2; turn off the Email provider; enable Google
- Google Cloud: OAuth client (consent screen, redirect URL from Supabase)
- GitHub: tag + rename + make private the old repo; create the new repo
- Vercel: new project, environment variables, cron secret

---

## 9. Secrets (planned)

| Name | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` + Vercel | Public by design; row level security protects data |
| `SUPABASE_SECRET_KEY` | `.env.local` + Vercel (server only) | Needed by cron/refresh routes to write tennis data; never imported by browser code |
| `BALLDONTLIE_API_KEY` (or one per tour) | `.env.local` + Vercel (server only) | Only read in `lib/provider/` |
| `CRON_SECRET` | Vercel | Lets only Vercel Cron call the daily job |
| Google OAuth client ID/secret | Supabase dashboard only | Never in the repo |

`.env*` is gitignored from the first commit. Nothing secret is ever pasted into chat.

---

## 10. Open questions / to verify

- ~~Does one BALLDONTLIE free key cover both ATP and WTA?~~ **Yes** (verified 2026-10-01; each tour has its own 5 req/min limit).
- BALLDONTLIE live latency and "today's matches" query (Phase B trial)
- Is the old Flask app still deployed anywhere? If so, take it down.
- Wikimedia coverage: how many of the top 200 have a freely licensed photo? (measured in Phase A)
