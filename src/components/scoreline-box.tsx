import Link from "next/link";

import { gamesRange, matchScorelines } from "@/lib/scorelines";

const pct = (p: number) => (p >= 0.995 ? "99%+" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

/**
 * Likely scorelines from the pre-match chance: each match score in sets, the chance of a tiebreak
 * and total games; for a finished match, how likely the actual scoreline was.
 */
export function ScorelineBox({
  chanceA,
  bestOf,
  params,
  nameA,
  nameB,
  actual,
}: {
  chanceA: number;
  bestOf: 3 | 5;
  params: { average: number; tau: number };
  nameA: string;
  nameB: string;
  actual: { a: number; b: number } | null;
}) {
  const s = matchScorelines(chanceA, bestOf, params);
  const [lo, hi] = gamesRange(s.games);
  const order = [...s.sets].sort((x, y) => y.a - y.b - (x.a - x.b) || y.a - x.a);
  const max = Math.max(...order.map((o) => o.p));
  const last = (n: string) => n.split(" ").at(-1);
  const hit = actual ? s.sets.find((o) => o.a === actual.a && o.b === actual.b) : undefined;
  const set = s.setScores[0];
  return (
    <section aria-labelledby="scorelines-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="scorelines-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Likely scorelines
      </h2>
      <ul className="space-y-1.5">
        {order.map((o) => {
          const winner = o.a > o.b ? nameA : nameB;
          const isActual = actual && o.a === actual.a && o.b === actual.b;
          return (
            <li key={`${o.a}-${o.b}`} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[11rem_1fr_3rem]">
              <span className={`truncate ${isActual ? "font-semibold" : ""}`}>
                {last(winner)} {Math.max(o.a, o.b)}–{Math.min(o.a, o.b)}
                {isActual ? " ✓" : ""}
              </span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <span className={`block h-full rounded-full ${o.a > o.b ? "bg-chart-line" : "bg-chart-line-2"}`} style={{ width: `${(o.p / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">{pct(o.p)}</span>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">A tiebreak</dt>
          <dd className="font-semibold tabular-nums">{pct(s.tiebreak)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total games</dt>
          <dd className="font-semibold tabular-nums">
            {lo}–{hi}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Likeliest set</dt>
          <dd className="font-semibold tabular-nums">{set ? `${Math.max(set.a, set.b)}–${Math.min(set.a, set.b)}` : "–"}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        {hit && <>The actual scoreline had a {pct(hit.p)} chance. </>}
        Total games: the middle 80% of outcomes. From the model’s chance, played out point by point with day-to-day form;{" "}
        <Link href="/lab/scorelines" className="underline hover:text-foreground">
          checked against 47,000 matches
        </Link>
        .
      </p>
    </section>
  );
}
