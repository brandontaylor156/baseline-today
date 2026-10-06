import type { Metadata } from "next";
import Link from "next/link";

import { getUpsetRates, type Rate } from "@/lib/data/insights";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How often favorites lose",
  description: "Upset rates in ATP and WTA tennis since 2016, by round, surface, tour and season, and how this week compares.",
};

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "–");

/** One bar per group: share of matches the model's favorite lost. Values are always printed. */
function Bars({ title, rows, max }: { title: string; rows: Rate[]; max: number }) {
  return (
    <section aria-labelledby={`b-${title}`} className="rounded-xl border border-border bg-surface p-4">
      <h2 id={`b-${title}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-28" />
          <col />
          <col className="w-16" />
          <col className="hidden w-28 sm:table-column" />
        </colgroup>
        <caption className="sr-only">Upset rate by {title.toLowerCase()}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Upset rate</th>
            <th scope="col">Upsets / matches</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rate = r.matches ? r.upsets / r.matches : 0;
            return (
              <tr key={r.key} title={`${r.key}: ${r.upsets.toLocaleString("en-US")} upsets in ${r.matches.toLocaleString("en-US")} matches; favorites averaged a ${Math.round(r.favoriteChance * 100)}% chance`}>
                <th scope="row" className="truncate py-1 pr-2 text-left font-normal">
                  {r.key}
                </th>
                <td className="w-full py-1">
                  <span aria-hidden className="flex h-2.5 overflow-hidden rounded-r bg-surface-muted">
                    <span className="rounded-r bg-chart-line" style={{ width: `${(rate / max) * 100}%` }} />
                  </span>
                </td>
                <td className="whitespace-nowrap py-1 pl-3 text-right font-semibold tabular-nums">{pct(r.upsets, r.matches)}</td>
                <td className="hidden whitespace-nowrap py-1 pl-3 text-right text-xs text-muted tabular-nums sm:table-cell">
                  {r.upsets.toLocaleString("en-US")} / {r.matches.toLocaleString("en-US")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function UpsetsPage() {
  const r = await getUpsetRates();
  const all = r.all;
  const recent = r.recent;
  const groups = [r.round, r.surface, r.tour, r.season];
  const max = Math.max(0.01, ...groups.flat().map((x) => (x.matches ? x.upsets / x.matches : 0)));
  const usual = all && all.matches ? all.upsets / all.matches : null;
  const now = recent && recent.matches >= 20 ? recent.upsets / recent.matches : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How often favorites lose</h1>
        <p className="text-sm text-muted">
          An upset is a win by the player our model rated less likely to win before the match. Every tracked singles match since 2016,
          walkovers excluded.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Favorites lose</dt>
          <dd className="text-2xl font-semibold tabular-nums">{all ? pct(all.upsets, all.matches) : "–"}</dd>
          <dd className="text-xs text-muted">of {all?.matches.toLocaleString("en-US") ?? 0} matches since 2016</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Last 7 days</dt>
          <dd className="text-2xl font-semibold tabular-nums">{now !== null ? `${(now * 100).toFixed(1)}%` : "–"}</dd>
          <dd className="text-xs text-muted">
            {now !== null && usual
              ? `${recent!.upsets} of ${recent!.matches} matches: ${
                  Math.abs(now / usual - 1) < 0.1 ? `about the usual ${(usual * 100).toFixed(1)}%` : `${(now / usual).toFixed(1)}× the usual ${(usual * 100).toFixed(1)}%`
                }`
              : "Too few matches this week to compare"}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Model expected</dt>
          <dd className="text-2xl font-semibold tabular-nums">{all ? `${((1 - all.favoriteChance) * 100).toFixed(1)}%` : "–"}</dd>
          <dd className="text-xs text-muted">upsets, from the favorites’ average chance: a calibrated model gets this close to the actual rate</dd>
        </div>
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="By round" rows={r.round} max={max} />
        <Bars title="By surface" rows={r.surface} max={max} />
        <Bars title="By tour" rows={r.tour} max={max} />
        <Bars title="By season" rows={r.season} max={max} />
      </div>
      <p className="text-xs text-muted">
        Bars share one scale. More on the model: <Link href="/model" className="underline underline-offset-2">accuracy over time</Link> ·{" "}
        <Link href="/stats" className="underline underline-offset-2">this season’s biggest upsets</Link>.
      </p>
    </div>
  );
}
