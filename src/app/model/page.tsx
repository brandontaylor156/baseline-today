import type { Metadata } from "next";
import Link from "next/link";

import { SeasonLines } from "@/components/season-lines";
import { getModelAccuracy, type AccuracyRow } from "@/lib/data/insights";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Model accuracy",
  description: "How often our tennis prediction model picks the winner, season by season since 2016, by tour and surface, compared with the ranking.",
};

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "–");

function sum(rows: AccuracyRow[]) {
  const matches = rows.reduce((s, r) => s + r.matches, 0);
  return {
    matches,
    correct: rows.reduce((s, r) => s + r.correct, 0),
    brier: matches ? rows.reduce((s, r) => s + r.brier * r.matches, 0) / matches : 0,
    ranked: rows.reduce((s, r) => s + r.ranked, 0),
    model: rows.reduce((s, r) => s + r.rankedModelCorrect, 0),
    rank: rows.reduce((s, r) => s + r.rankedRankCorrect, 0),
  };
}

export default async function ModelPage() {
  const rows = (await getModelAccuracy()).filter((r) => r.season >= 2016);
  const latest = Math.max(...rows.map((r) => r.season));
  const thisSeason = sum(rows.filter((r) => r.season === latest));
  const baseline = sum(rows.filter((r) => r.season >= 2025));
  const series = ["atp", "wta"].map((tour) => ({
    name: tour.toUpperCase(),
    points: [...new Set(rows.map((r) => r.season))]
      .sort()
      .map((season) => {
        const s = sum(rows.filter((r) => r.tour === tour && r.season === season));
        return { season, value: s.matches ? s.correct / s.matches : 0, n: s.matches };
      })
      .filter((p) => p.n >= 50),
  }));
  const surfaces = ["Hard", "Clay", "Grass"].map((surface) => ({ surface, all: sum(rows.filter((r) => r.surface === surface)), now: sum(rows.filter((r) => r.surface === surface && r.season === latest)) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Model accuracy</h1>
        <p className="text-sm text-muted">
          How often our surface-aware Elo model picked the winner, using only what it knew before each match. Walkovers excluded.{" "}
          <Link href="/ratings" className="underline underline-offset-2">
            Ratings and calibration
          </Link>
          .
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">{latest} accuracy</dt>
          <dd className="text-2xl font-semibold tabular-nums">{pct(thisSeason.correct, thisSeason.matches)}</dd>
          <dd className="text-xs text-muted">{thisSeason.matches.toLocaleString("en-US")} matches</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Model vs the ranking</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {pct(baseline.model, baseline.ranked)} <span className="text-base font-normal text-muted">vs {pct(baseline.rank, baseline.ranked)}</span>
          </dd>
          <dd className="text-xs text-muted">
            on {baseline.ranked.toLocaleString("en-US")} matches since 2025 between two top-100 players, against “the higher-ranked player wins”
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">{latest} Brier score</dt>
          <dd className="text-2xl font-semibold tabular-nums">{thisSeason.brier.toFixed(3)}</dd>
          <dd className="text-xs text-muted">lower is better; always saying 50% scores 0.250</dd>
        </div>
      </dl>

      <section aria-labelledby="season-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 id="season-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Accuracy by season
        </h2>
        <SeasonLines series={series} label="Share of matches where the model's favorite won, by season, ATP and WTA" />
      </section>

      <section aria-labelledby="surface-heading" className="space-y-2">
        <h2 id="surface-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          By surface
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Model accuracy by surface</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Surface</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Since 2016</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{latest}</th>
                <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Matches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {surfaces.map((s) => (
                <tr key={s.surface}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">{s.surface}</th>
                  <td className="px-2 py-2 text-right font-semibold">{pct(s.all.correct, s.all.matches)}</td>
                  <td className="px-2 py-2 text-right">{pct(s.now.correct, s.now.matches)}</td>
                  <td className="hidden px-4 py-2 text-right text-muted sm:table-cell">{s.all.matches.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Early seasons have less history behind each rating, so they’re a little less accurate. See also{" "}
          <Link href="/upsets" className="underline underline-offset-2">how often favorites lose</Link>.
        </p>
      </section>
    </div>
  );
}
