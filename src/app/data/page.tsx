import type { Metadata } from "next";
import Link from "next/link";

import { FIRST_SEASON, RATING_COLUMNS, RESULT_COLUMNS } from "@/lib/open-data";

export const metadata: Metadata = {
  title: "Open tennis data",
  description: "Free downloads: every ATP and WTA singles result since 2015 as CSV or JSON, and Elo ratings by surface. CC BY-SA 4.0.",
};

export default function DataPage() {
  const current = new Date().getUTCFullYear();
  const seasons = Array.from({ length: current - FIRST_SEASON + 1 }, (_, i) => current - i);
  const link = "font-medium text-accent hover:underline";
  return (
    <article className="max-w-3xl space-y-8 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Open tennis data</h1>
        <p className="text-muted">
          Every ATP and WTA singles result we track since {FIRST_SEASON}, and our model’s Elo ratings, free to download as CSV or
          JSON. No sign-up and no API key. Files update daily.
        </p>
        <p className="rounded-xl border border-border bg-surface p-4 text-sm">
          <strong>License:</strong> the results come from Wikipedia’s draw pages, written by Wikipedia contributors and licensed{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline underline-offset-2">
            CC BY-SA 4.0
          </a>
          . These downloads, and the ratings computed from them, are shared under the same license. Every row carries its source
          and the license, so the credit travels with the data.
        </p>
      </header>

      <section aria-labelledby="results-heading" className="space-y-3">
        <h2 id="results-heading" className="text-lg font-semibold">
          Results by season
        </h2>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {seasons.map((s) => (
            <li key={s} className="rounded-lg border border-border bg-surface px-3 py-2">
              <span className="font-medium">{s}</span>{" "}
              <a href={`/data/results-${s}.csv`} className={link}>
                CSV
              </a>{" "}
              ·{" "}
              <a href={`/data/results-${s}.json`} className={link}>
                JSON
              </a>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Columns: <code className="text-xs">{RESULT_COLUMNS.join(", ")}</code>. The score is from the winner’s side;{" "}
          <code className="text-xs">model_winner_chance</code> is our model’s pre-match chance for the eventual winner (blank where it
          had no prediction); <code className="text-xs">source</code> is the Wikipedia draw page the result was read from.
        </p>
      </section>

      <section aria-labelledby="ratings-heading" className="space-y-3">
        <h2 id="ratings-heading" className="text-lg font-semibold">
          Model ratings
        </h2>
        <p className="text-sm">
          <a href="/data/ratings.csv" className={link}>
            ratings.csv
          </a>{" "}
          ·{" "}
          <a href="/data/ratings.json" className={link}>
            ratings.json
          </a>{" "}
          <span className="text-muted">
            : players active in the last year. Columns: <code className="text-xs">{RATING_COLUMNS.join(", ")}</code>.{" "}
            <Link href="/ratings" className="underline underline-offset-2">
              How the model works
            </Link>
            .
          </span>
        </p>
      </section>

      <section aria-labelledby="api-heading" className="space-y-3">
        <h2 id="api-heading" className="text-lg font-semibold">
          JSON API
        </h2>
        <p className="text-sm text-muted">Free, no key, CORS open, cached at the edge. Please cache on your side too, and credit as below.</p>
        <ul className="space-y-2 text-sm">
          {[
            ["/api/v1/players?q=sinner", "Find player ids (accent-insensitive)."],
            ["/api/v1/h2h?a=4&b=6", "Head-to-head: record, by surface, every meeting and the model’s chance on each surface."],
            ["/api/v1/title-odds/<tournament id>", "Each remaining player’s chance to reach every round of a draw in progress."],
            ["/api/v1/upsets?days=7&max=0.35", "Recent wins where our model gave the winner the smallest chance."],
          ].map(([path, what]) => (
            <li key={path} className="rounded-lg border border-border bg-surface px-3 py-2">
              <a href={path.includes("<") ? undefined : path} className="font-mono text-xs text-accent hover:underline">
                GET {path}
              </a>
              <span className="block text-muted">{what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="license-heading" className="space-y-2 text-sm">
        <h2 id="license-heading" className="text-lg font-semibold">
          License and credit
        </h2>
        <p>
          Results come from the singles draw pages of{" "}
          <a href="https://www.wikipedia.org/" className="underline underline-offset-2">
            Wikipedia
          </a>{" "}
          (the English edition, and the Italian one for about 1% of results), written by Wikipedia contributors under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline underline-offset-2">
            CC BY-SA 4.0
          </a>
          . We compile them and share these files under the same license, CC BY-SA 4.0. You can use the data for anything,
          including commercially, as long as you credit it and share what you make from the data under CC BY-SA 4.0 too.
        </p>
        <p>Suggested credit:</p>
        <blockquote className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          Tennis results from Wikipedia draw pages (Wikipedia contributors, CC BY-SA 4.0), compiled by Baseline Today
          (baseline-today.vercel.app/data), CC BY-SA 4.0.
        </blockquote>
        <p className="text-muted">
          Rankings aren’t included: they come from a data provider whose terms don’t allow redistribution. Results can contain errors
          from the source pages; they’re checked automatically but not by hand. Not affiliated with the ATP or WTA.
        </p>
      </section>
    </article>
  );
}
