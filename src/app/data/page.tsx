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
          had no prediction).
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

      <section aria-labelledby="license-heading" className="space-y-2 text-sm">
        <h2 id="license-heading" className="text-lg font-semibold">
          License and credit
        </h2>
        <p>
          Results come from the singles draw pages of the English{" "}
          <a href="https://en.wikipedia.org/" className="underline underline-offset-2">
            Wikipedia
          </a>
          , written by its volunteer editors. This data, and the ratings computed from it, are shared under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline underline-offset-2">
            CC BY-SA 4.0
          </a>
          : you can use it for anything, including commercially, if you credit “Wikipedia and Baseline Today” with a link and share
          what you build from the data under the same license.
        </p>
        <p className="text-muted">
          Rankings aren’t included: they come from a data provider whose terms don’t allow redistribution. Results can contain errors
          from the source pages; they’re checked automatically but not by hand. Not affiliated with the ATP or WTA.
        </p>
      </section>
    </article>
  );
}
