import type { Metadata } from "next";
import Link from "next/link";

import { createPublicClient } from "@/lib/supabase/public";
import type { FactorResult, FactorsCache } from "@/lib/sync/factors";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "What decides matches",
  description:
    "Fatigue, long matches, layoffs, surface changes, home crowds and inexperience, measured on 48,000 matches against the rating model: what each is worth in rating points, and whether it predicts anything.",
};

const TOURS = [
  { key: "atp", label: "ATP", color: "var(--chart-line)" },
  { key: "wta", label: "WTA", color: "var(--chart-line-2)" },
] as const;

const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}`;
const real = (f: FactorResult) => f.low > 0 || f.high < 0;

function verdict(atp: FactorResult, wta: FactorResult): string {
  const a = real(atp);
  const w = real(wta);
  if (a && w)
    return Math.sign(atp.points) === Math.sign(wta.points)
      ? "Real on both tours"
      : "Real, but opposite on the two tours";
  if (a) return "Real on the ATP only";
  if (w) return "Real on the WTA only";
  return "Not detectable";
}

/** Forest plot: each factor's effect with its 95% interval, ATP and WTA, against zero (HTML rows, so labels line up). */
function Forest({ data }: { data: FactorsCache }) {
  const factors = data.tours.atp.factors;
  const all = TOURS.flatMap((t) =>
    data.tours[t.key].factors.flatMap((f) => [f.low, f.high]),
  );
  const max = Math.ceil(Math.max(...all.map(Math.abs), 20) / 10) * 10;
  const at = (v: number) => `${((v + max) / (2 * max)) * 100}%`;
  const ticks = [-max, -max / 2, 0, max / 2, max];
  const wta = data.tours.wta.factors;
  return (
    <div
      role="img"
      aria-label="Each factor's effect in rating points with a 95% interval, ATP and WTA. Values are in the table below."
    >
      {factors.map((f, i) => (
        <div
          key={f.key}
          className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-x-3 border-b border-border py-2 last:border-b-0 sm:grid-cols-[minmax(0,15rem)_1fr]"
        >
          <div className="text-xs leading-tight sm:text-sm">
            <div>{f.label}</div>
            <div className="text-muted">{verdict(f, wta[i])}</div>
          </div>
          <div className="relative h-9">
            <div
              className="absolute inset-y-0 w-px bg-border"
              style={{ left: at(0) }}
              aria-hidden
            />
            {TOURS.map((t, j) => {
              const r = data.tours[t.key].factors[i];
              return (
                <div
                  key={t.key}
                  className="absolute inset-x-0"
                  style={{ top: j === 0 ? "30%" : "70%" }}
                  title={`${t.label}: ${signed(r.points)} (95%: ${signed(r.low)} to ${signed(r.high)})`}
                >
                  <div
                    className="absolute h-0.5 -translate-y-1/2 rounded-full"
                    style={{
                      left: at(r.low),
                      width: `calc(${at(r.high)} - ${at(r.low)})`,
                      background: t.color,
                    }}
                  />
                  <div
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                    style={{
                      left: at(r.points),
                      borderColor: t.color,
                      background: real(r) ? t.color : "var(--surface)",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div
        className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 sm:grid-cols-[minmax(0,15rem)_1fr]"
        aria-hidden
      >
        <div />
        <div className="relative h-5 text-[11px] text-muted tabular-nums">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: at(t) }}
            >
              {t === 0 ? "0" : signed(t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function FactorsPage() {
  const { data: row } = await createPublicClient()
    .from("stat_cache")
    .select("data")
    .eq("key", "lab:factors")
    .maybeSingle();
  const data = row?.data as unknown as FactorsCache | undefined;
  const atp = data?.tours.atp;
  const wta = data?.tours.wta;
  const gain = (t: { base: number; full: number }) =>
    ((t.base - t.full) / t.base) * 100;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          What decides matches
        </h1>
        <p className="text-sm text-muted">
          The rating model knows how good each player is. Does anything else
          matter? Every match since 2016, the model’s chance before it, and
          seven things the ratings can’t see. Each effect is in rating points:
          what it’s worth on top of the ratings, with a 95% interval.
        </p>
      </div>

      {!data || !atp || !wta ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          Computed weekly; check back soon.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="forest-heading"
            className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="forest-heading"
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                Effect on a player’s chances, in rating points
              </h2>
              <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
                {TOURS.map((t) => (
                  <li key={t.key} className="flex items-center gap-1.5">
                    <svg width="16" height="8" aria-hidden>
                      <line
                        x1="0"
                        x2="16"
                        y1="4"
                        y2="4"
                        stroke={t.color}
                        strokeWidth="2"
                      />
                      <circle cx="8" cy="4" r="3.5" fill={t.color} />
                    </svg>
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>
            <Forest data={data} />
            <p className="text-xs text-muted">
              Left of zero: worse than the ratings say. Filled dots: the
              interval doesn’t include zero. 100 rating points is about the gap
              between a 50% and a 64% chance.
            </p>
          </section>

          <section aria-labelledby="findings-heading" className="space-y-3">
            <h2
              id="findings-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              What we found
            </h2>
            <ul className="max-w-2xl list-disc space-y-2 pl-5 text-sm">
              {(() => {
                const f = (t: typeof atp, k: string) =>
                  t.factors.find((x) => x.key === k)!;
                return (
                  <>
                    <li>
                      <strong>Coming back costs.</strong> In the first event
                      after eight weeks or more out, players play about{" "}
                      {Math.abs(Math.round(f(atp, "layoff").points))} (ATP) and{" "}
                      {Math.abs(Math.round(f(wta, "layoff").points))} (WTA)
                      rating points below their rating.
                    </li>
                    <li>
                      <strong>Tiredness is real but small.</strong> Every 10
                      games already played in a tournament is worth about{" "}
                      {Math.abs(Math.round(f(atp, "load").points))} (ATP) and{" "}
                      {Math.abs(Math.round(f(wta, "load").points))} (WTA)
                      points. On the WTA, coming off a three-setter costs about{" "}
                      {Math.abs(Math.round(f(wta, "long").points))} more; on the
                      ATP, a long last match shows no measurable effect.
                    </li>
                    <li>
                      <strong>New players are overrated by any rating</strong>{" "}
                      until it has seen enough of them: with fewer than 20
                      matches on record, players do{" "}
                      {Math.abs(Math.round(f(atp, "rookie").points))} (ATP) and{" "}
                      {Math.abs(Math.round(f(wta, "rookie").points))} (WTA)
                      points worse than their rating.
                    </li>
                    <li>
                      <strong>No home advantage.</strong> If anything the
                      opposite on the WTA ({signed(f(wta, "home").points)}),
                      perhaps because home players get wildcards into events
                      above their level, or the pressure. On the ATP:{" "}
                      {signed(f(atp, "home").points)}, not distinguishable from
                      nothing.
                    </li>
                    <li>
                      <strong>Myths, as far as the data can tell:</strong> a
                      deep run the week before doesn’t tire players out (
                      {signed(f(atp, "lastWeek").points)} and{" "}
                      {signed(f(wta, "lastWeek").points)}, if anything the
                      reverse), and the first event on a new surface costs at
                      most a little ({signed(f(atp, "newSurface").points)} and{" "}
                      {signed(f(wta, "newSurface").points)}, not quite
                      distinguishable from nothing).
                    </li>
                  </>
                );
              })()}
            </ul>
          </section>

          <section aria-labelledby="holdout-heading" className="space-y-2">
            <h2
              id="holdout-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Do they predict anything?
            </h2>
            <p className="max-w-2xl text-sm text-muted">
              Fitted on 2016–2022 and tested on every match since 2023, adding
              all seven factors to the model improves its predictions (log loss)
              by {gain(atp).toFixed(2)}% on the ATP and {gain(wta).toFixed(2)}%
              on the WTA. Small, as it should be: the ratings already explain
              most of what can be explained. The table shows each factor on its
              own.
            </p>
          </section>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">
                Each factor’s effect in rating points with a 95% interval, and
                its effect on holdout predictions
              </caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Factor
                  </th>
                  {TOURS.map((t) => (
                    <th
                      key={t.key}
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      {t.label}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                  >
                    Matches (ATP / WTA)
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium md:table-cell"
                  >
                    Holdout (ATP / WTA)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {atp.factors.map((f, i) => {
                  const w = wta.factors[i];
                  const h = (r: FactorResult) =>
                    r.holdout < -0.0003
                      ? "better"
                      : r.holdout > 0.0003
                        ? "worse"
                        : "same";
                  return (
                    <tr key={f.key}>
                      <th
                        scope="row"
                        className="px-3 py-2 text-left font-normal"
                      >
                        {f.label}{" "}
                        <span className="text-xs text-muted">({f.unit})</span>
                      </th>
                      {[f, w].map((r, j) => (
                        <td
                          key={j}
                          className={`px-3 py-2 text-right ${real(r) ? "font-semibold" : "text-muted"}`}
                        >
                          {signed(r.points)}{" "}
                          <span className="text-xs font-normal text-muted">
                            ({signed(r.low)} to {signed(r.high)})
                          </span>
                        </td>
                      ))}
                      <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">
                        {f.matches.toLocaleString("en-US")} /{" "}
                        {w.matches.toLocaleString("en-US")}
                      </td>
                      <td className="hidden px-3 py-2 text-right text-muted md:table-cell">
                        {h(f)} / {h(w)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Method: a logistic regression of each result on the model’s
            pre-match chance and the two players’ difference on each factor, all
            at once, so each effect is net of the others.{" "}
            {atp.matches.toLocaleString("en-US")} ATP and{" "}
            {wta.matches.toLocaleString("en-US")} WTA matches from 2016 (2015 is
            burn-in); walkovers left out. Match dates aren’t in the draws, so
            tiredness is measured within a tournament and across consecutive
            weeks. These are associations: a player who needed many games may
            also be in poorer form than their rating says. Home soil from the
            tournament’s location and the player’s nationality.
          </p>
        </>
      )}
    </div>
  );
}
