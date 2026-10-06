import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it's built",
  description:
    "Case study: a tennis site that runs on free tiers. Wikipedia draw parsing, a calibrated Elo model, exact title odds, row level security for multiplayer games, and the tests behind it.",
};

const REPO = "https://github.com/brandontaylor156/baseline-today";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-sm text-muted">{label}</dt>
    </div>
  );
}

export default function AboutPage() {
  const a = "underline underline-offset-2";
  return (
    <article className="max-w-3xl space-y-10 leading-relaxed">
      <header className="space-y-3">
        <p className="text-sm font-medium text-accent">Case study</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How Baseline Today is built</h1>
        <p className="text-lg text-muted">
          A tennis site with rankings, results back to 2015, a win-probability model, exact title chances for every draw, and
          multiplayer games, built by one developer for $0 a month. These are the problems that made it interesting.
        </p>
        <p className="text-sm">
          <a href={REPO} className="font-medium text-accent hover:underline">
            Source on GitHub →
          </a>
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact value="52,000+" label="results parsed from Wikipedia" />
        <Fact value="64%" label="of 2026 matches called by the model" />
        <Fact value="55" label="row level security checks in CI" />
        <Fact value="$0" label="monthly hosting and data cost" />
      </dl>

      <Section id="data" title="1. No free live data, so no live calls at all">
        <p>
          Live tennis data costs money, and the free rankings API allows 5 requests a minute. So the site follows one rule:{" "}
          <strong>a page visit never calls a data provider.</strong> A daily job copies rankings and profiles into Postgres behind
          a database lock, and every page reads from there through Next.js’s data cache. The free hosting plan only runs scheduled
          jobs once a day, so the 10-minute results job runs from the database itself (Supabase cron calling an endpoint that is
          safe to call often: locked, and it skips unchanged pages).
        </p>
        <p>
          All provider code sits behind our own types in one folder. Pages and the database never see the provider’s response
          format, so it can be swapped without touching anything else.
        </p>
      </Section>

      <Section id="wikipedia" title="2. Results from Wikipedia draw pages">
        <p>
          Wikipedia’s volunteers update tournament draws within minutes, under an open license. Turning a draw page into results
          was the hardest part:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Finding the page.</strong> Each tournament is matched to its draw page by distinctive title words (or a curated
            alias), which tour the page mentions, and the draw size, so a 32-player WTA event never picks up the 28-player ATP page
            for the same city.
          </li>
          <li>
            <strong>Reading the bracket.</strong> A parser walks the bracket templates round by round and reads set scores,
            tiebreaks, retirements and walkovers.
          </li>
          <li>
            <strong>Not trusting edits too early.</strong> A result shows only after its page has been unchanged for 10 minutes,
            results that vanish from a page are hidden, and only pages with a new revision are downloaded again.
          </li>
          <li>
            <strong>Auditing.</strong> A check flags results shown under a tournament but taken from a different page; the{" "}
            <Link href="/status" className={a}>
              status page
            </Link>{" "}
            shows it live.
          </li>
        </ul>
      </Section>

      <Section id="model" title="3. A model that says how sure it is">
        <p>
          Win chances come from a surface-aware Elo model, calibrated on the previous season and tested on matches it hasn’t seen
          (Brier score 0.219 on held-out ATP matches). It calls about 64% of this season’s matches, and its{" "}
          <Link href="/ratings" className={a}>
            calibration table
          </Link>{" "}
          shows how often its favorites actually won at each level of confidence.
        </p>
        <p>
          <strong>Title chances are exact, not simulated.</strong> The bracket layout is read off the draw page, and each
          player’s chance to reach every round is computed through the bracket from the model’s chance for every possible match.
          The <Link href="/tournaments" className={a}>interactive draw</Link> recomputes all of it in the browser when you tap “what
          if” winners.
        </p>
        <p>
          A point-level model turns any score into a win chance. It is fitted so that at 0-0 it reproduces the pre-match chance,
          which keeps live and pre-match numbers consistent. It powers watch parties and the{" "}
          <Link href="/party/demo" className={a}>
            simulated replay demo
          </Link>
          .
        </p>
      </Section>

      <Section id="lab" title="4. Replaying ten years of tennis">
        <p>
          The <Link href="/lab" className={a}>research lab</Link> replays every result since 2015 in order through the rating model. At
          the start of each tournament it rebuilds the draw from the results alone (every later-round match was between the winners of
          two earlier ones), then computes each entrant’s exact title chance from the ratings of that week: 1,120 draws, 48,000 title
          chances.
        </p>
        <p>
          That one replay answers questions that usually need a data team: who won more titles than their chances said, which titles
          were the most improbable, how many titles one player cost another (each draw replayed without them), and who wins more
          tiebreaks and deciding sets than a point-level model of the matchup expects.
        </p>
      </Section>

      <Section id="security" title="5. Multiplayer games on row level security">
        <p>
          Pick’em, Bracket Challenge, private leagues and watch parties are enforced by Postgres row level security, not by app
          code. Picks lock once a result is posted, brackets lock at the first result, and league and party data is visible only
          to members. Public numbers such as leaderboards and favorite counts come from functions that return totals and never
          reveal who.
        </p>
        <p>
          Watch-party chat runs over private realtime channels whose access policy calls the same membership check, and is never
          stored. A test runs 55 checks on every push against a throwaway database built from the migrations. For example, it
          confirms that a guest removed from a party immediately loses access to its channel.
        </p>
      </Section>

      <Section id="quality" title="6. Quality on a budget">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Unit tests for every pure piece: parsing, Elo, title odds, the live model, scorekeeping, bracket scoring.</li>
          <li>Browser tests on desktop and phone for every page type, plus automated accessibility checks (WCAG 2.2 AA) in light and dark mode.</li>
          <li>
            The auth library (~70 KB) loads only for signed-in visitors, and signed-out views render on the server, so most visitors
            get a fast first paint.
          </li>
          <li>
            Job failures post an alert, and <Link href="/status" className={a}>/status</Link> shows the freshness of every dataset.
          </li>
        </ul>
      </Section>

      <Section id="open" title="7. Open by default">
        <p>
          The results and ratings are free to download as CSV or JSON on the{" "}
          <Link href="/data" className={a}>
            open data page
          </Link>
          , under the same license as Wikipedia. Rankings aren’t included, because the provider’s terms don’t allow it. That kind
          of licensing detail shaped a lot of the site: photos are only freely licensed Wikimedia images with credit, and the
          data is never called “official”.
        </p>
      </Section>

      <Section id="stack" title="Stack">
        <p className="text-muted">
          Next.js (App Router, server components) · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime,
          cron) · Vercel · Vitest · Playwright · axe · GitHub Actions
        </p>
      </Section>
    </article>
  );
}
