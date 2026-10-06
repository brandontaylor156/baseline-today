# Launch posts (drafts)

Post these yourself from your own accounts. Read each community's rules first: r/tennis limits
self-promotion, so post as a person sharing a free tool, answer comments, and don't repost.

---

## r/tennis

**Title:** I built a free site with exact title chances for every draw, all head-to-heads since 2015, and a model you can try to beat

**Body:**

Hi r/tennis. I've been building a tennis side project and it's finally in a state worth sharing:
https://baseline-today.vercel.app

What it does:

- **Title chances for every tournament in progress**, worked out exactly through the bracket from
  the results so far. You can tap "what if" winners in the draw and watch every chance update.
- **Head-to-heads for any two players since 2015**, split by surface, with every meeting
  (e.g. Sinner vs Alcaraz, Sabalenka vs Rybakina).
- **A weekly recap**: champions, the biggest upsets and ranking movers, plus how the model did.
- **Pick'em**: pick winners and see if you can beat the model (it picks the favorite and gets
  about 64% right). You can try it without an account.
- **Watch parties**: a private room with friends for a match, with chat and win chances.
- **Free data downloads**: every result since 2015 as CSV/JSON.

No ads, no betting links, no sign-up needed to browse. Results come from Wikipedia's draw pages
(credited everywhere), usually within half an hour of a match ending. It isn't a live-score site.

I'd love feedback, especially if a result or a draw looks wrong somewhere.

---

## Hacker News (Show HN)

**Title:** Show HN: Baseline Today – tennis stats and exact title odds, built on free tiers

**URL:** https://baseline-today.vercel.app/about

**First comment:**

I built this to see how far free tiers go for a data-heavy sports site. Some parts that were fun:

- Results come from Wikipedia draw pages: matching tournaments to the right page, parsing the
  bracket templates, and only trusting a result once the page has been stable for 10 minutes.
  52,000+ matches since 2015.
- Title chances are computed exactly through the bracket (not Monte Carlo) from a surface-aware
  Elo model, and recomputed client-side when you click hypothetical winners.
- The multiplayer bits (pick'em, leagues, watch parties with realtime chat) are enforced entirely
  with Postgres row level security, with a 55-check isolation test in CI.
- Page visits never call a data API; scheduled jobs fill Postgres and pages read through a cache.

Stack: Next.js, Supabase, Vercel. Code: https://github.com/brandontaylor156/baseline-today.
Happy to answer questions.

---

## Bluesky (first post from the bot account, pin it)

Hi! I'm an automated account 🤖. I post the day's biggest tennis upset and a weekly recap of
champions and ranking movers, from https://baseline-today.vercel.app. A human reads the replies. Free and ad-free: title chances for every draw,
head-to-heads since 2015, and a pick'em where you can try to beat the model. #tennis
