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

**Title:** Show HN: I rebuilt 1,120 tennis draws from Wikipedia and replayed a decade of results

**URL:** https://baseline-today.vercel.app/lab

**First comment:**

Baseline Today started as a tennis stats site on free tiers and turned into a research lab. The
core is one replay:

- 52,000+ results since 2015 come from Wikipedia draw pages (matched to the right page, parsed from
  bracket templates, only trusted once the page has been stable for 10 minutes).
- Every result is replayed in order through a surface-aware Elo model. At the start of each
  tournament the bracket is rebuilt from the results alone (each later-round match is between the
  winners of two earlier ones), and every entrant's exact title chance is computed from that
  week's ratings: 1,120 draws, 48,000 chances.

That one replay answers questions I couldn't find answered for free anywhere:

- Expected vs actual titles: who converts their chances, and the most improbable champions
  (Vacherot at Shanghai 2025 was about a 1-in-80,000 shot by the model).
- Who stood in whose way: replay each draw without each contender. Alcaraz cost Sinner about 1.4
  expected titles; Djokovic cost the field 26.7.
- A clutch index: tiebreaks and deciding sets won against what a point-level model of each
  matchup expected.
- "If a Grand Slam started today": hundreds of random draws with real seeding rules, each solved
  exactly.

Everything is downloadable (CSV/JSON, CC BY-SA like the source) and there's a free JSON API.
Stack: Next.js, Supabase (Postgres + RLS), Vercel; all free tiers. Code:
https://github.com/brandontaylor156/baseline-today. Happy to answer questions about the bracket
reconstruction or the model.

---

## Bluesky (first post from the bot account, pin it)

Hi! I'm an automated account 🤖. I post the day's biggest tennis upset and a weekly recap of
champions and ranking movers, from https://baseline-today.vercel.app. A human reads the replies. Free and ad-free: title chances for every draw,
head-to-heads since 2015, and a pick'em where you can try to beat the model. #tennis
