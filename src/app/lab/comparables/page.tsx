import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { ProjectionComp, ProjectionRow, ProjectionsCache } from "@/lib/sync/projections";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Career comparables",
  description:
    "Every player's rating path over the last two years matched against every earlier player at the same age: who was on the same road, what became of them, and an honest, backtested range for the next two years.",
};

/** Chance against an average top-100 player, from a rating relative to the field. */
const vsField = (rel: number) => 1 / (1 + 10 ** (-rel / 400));
const pct = (rel: number | null) => (rel === null ? "–" : `${Math.round(vsField(rel) * 100)}%`);
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}`;

function Who({ p }: { p: { id: number | null; name: string; country: string | null } }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={p.country} reserve />
      {p.id ? (
        <Link href={`/players/${p.id}`} className="hover:underline">
          {p.name}
        </Link>
      ) : (
        <span>{p.name}</span>
      )}
    </span>
  );
}

function Later({ c, years }: { c: ProjectionComp; years: 1 | 2 }) {
  const v = years === 1 ? c.plus1 : c.plus2;
  if (v === null) return <span className="text-muted">–</span>;
  const d = vsField(v) - vsField(c.then);
  return (
    <>
      {pct(v)} <span className={`text-xs ${Math.abs(d) < 0.02 ? "text-muted" : d > 0 ? "text-up" : "text-down"}`}>({signed(d)})</span>
    </>
  );
}

export default async function ComparablesPage({ searchParams }: PageProps<"/lab/comparables">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data } = await createPublicClient().from("stat_cache").select("data").eq("key", `projections:${tour}`).maybeSingle();
  const cache = data?.data as unknown as ProjectionsCache | undefined;
  const players = cache?.players ?? [];
  const byName = [...players].sort((a, b) => a.name.localeCompare(b.name));
  // Default: the best-rated player 23 or younger.
  const chosen: ProjectionRow | undefined = players.find((p) => p.key === q.player) ?? players.find((p) => p.age < 24) ?? players[0];
  // How far below (or above) the closest paths sat, in percentage points against the field.
  const gap = chosen ? chosen.comps.reduce((s, c) => s + Math.abs(vsField(c.then) - vsField(chosen.rel)), 0) / Math.max(1, chosen.comps.length) : 0;
  const bt = cache?.backtests ?? [];
  const n = bt.reduce((s, b) => s + b.players, 0);
  const avg = (f: (b: (typeof bt)[number]) => number) => (n ? bt.reduce((s, b) => s + f(b) * b.players, 0) / n : 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Career comparables</h1>
          <p className="text-sm text-muted">
            Each player’s rating over the last two years, measured against that season’s field, matched with every earlier player at
            the same age. The closest paths, and what those players did next, give an honest range for the next two years.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={`/lab/comparables?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      {!chosen ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Comparables are computed weekly; check back soon.</p>
      ) : (
        <>
          <form action="/lab/comparables" className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tour" value={tour} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Player</span>
              <select name="player" defaultValue={chosen.key} className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2">
                {byName.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({Math.floor(p.age)})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-lg border border-border px-4 py-2 font-medium hover:bg-surface-muted">
              Show
            </button>
          </form>

          <section aria-labelledby="player-heading" className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div>
              <h2 id="player-heading" className="text-lg font-semibold">
                <Who p={chosen} />
              </h2>
              <p className="text-sm text-muted">
                Age {Math.floor(chosen.age)}. Would beat an average top-100 player <strong className="text-foreground">{pct(chosen.rel)}</strong> of the
                time today
                {chosen.path[1] !== null && <>, {pct(chosen.path[1])} a year ago</>}
                {chosen.path[2] !== null && <>, {pct(chosen.path[2])} two years ago</>}.
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "In a year", band: chosen.in1 },
                { label: "In two years", band: chosen.in2 },
              ].map(({ label, band }) => (
                <div key={label} className="rounded-lg bg-surface-muted p-3">
                  <dt className="text-xs text-muted">{label} (likely range)</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {band ? (
                      <>
                        {pct(chosen.rel + band.low)}–{pct(chosen.rel + band.high)}
                      </>
                    ) : (
                      "–"
                    )}
                  </dd>
                </div>
              ))}
              <div className="rounded-lg bg-surface-muted p-3">
                <dt className="text-xs text-muted">Closest 25 paths</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{Number.isFinite(chosen.rose) ? `${Math.round(chosen.rose * 100)}% rose` : "–"}</dd>
              </div>
            </dl>

            {gap >= 0.08 && (
              <p className="rounded-lg border border-border px-3 py-2 text-sm">
                Few players have been on quite this path at {Math.floor(chosen.age)}: the closest sat {Math.round(gap * 100)} points away on
                average, so treat the comparison as loose.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">The ten players whose paths at the same age were closest to {chosen.name}’s, and what they did next</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-2 font-medium">At {Math.floor(chosen.age)}</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Season</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Then</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">A year on</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Two years on</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {chosen.comps.map((c) => (
                    <tr key={c.key}>
                      <th scope="row" className="py-2 pr-2 text-left font-normal">
                        <Who p={c} />
                        <span className="block pl-[calc(1.333em+0.375rem)] text-xs text-muted sm:hidden">{c.season}</span>
                      </th>
                      <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{c.season}</td>
                      <td className="px-2 py-2 text-right">{pct(c.then)}</td>
                      <td className="px-2 py-2 text-right">
                        <Later c={c} years={1} />
                      </td>
                      <td className="hidden px-2 py-2 text-right sm:table-cell">
                        <Later c={c} years={2} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              Percentages: chance of beating an average top-100 player of that season, so eras compare fairly. The likely range is the middle
              60% of what the 25 closest players did next.
            </p>
          </section>
        </>
      )}

      {n > 0 && (
        <section aria-labelledby="backtest-heading" className="space-y-3">
          <h2 id="backtest-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Does it work? The backtest
          </h2>
          <p className="max-w-2xl text-sm text-muted">
            We rewound to the start of each season from 2021, projected every player aged 18 to 30 using only results up to then, and
            checked a year later. The likely range held the real outcome {Math.round(avg((b) => b.coverage) * 100)}% of the time (it aims for
            60%), so the range is honest. The middle of the range was off by {Math.round(avg((b) => b.error))} rating points on average,
            against {Math.round(avg((b) => b.baseline))} for simply assuming no change: a year of tennis is mostly unpredictable, and the
            comparables don’t pretend otherwise. Read the range, not a single number.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Backtest of the comparables by season, {TOUR_LABEL[tour]}</caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Projected from</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Players</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Inside range</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Error</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">No-change error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bt.map((b) => (
                  <tr key={b.asOf}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      Start of {b.asOf.slice(0, 4)}
                    </th>
                    <td className="px-2 py-2 text-right">{b.players}</td>
                    <td className="px-2 py-2 text-right">{Math.round(b.coverage * 100)}%</td>
                    <td className="px-2 py-2 text-right">{Math.round(b.error)}</td>
                    <td className="px-3 py-2 text-right text-muted">{Math.round(b.baseline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        Ages from Wikidata (CC0) and player records; players without a known birth date are left out. Ratings from every result since 2015.
        Updated weekly. Estimates, not betting advice.
      </p>
    </div>
  );
}
