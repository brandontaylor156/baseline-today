import { winPct, type PlayerStats, type WL } from "@/lib/stats";

const record = (x: WL) => `${x.w}–${x.l}`;
const pct = (x: WL) => {
  const p = winPct(x);
  return p === null ? "–" : `${Math.round(p * 100)}%`;
};

/** Season vs all tracked seasons: surfaces, tiebreaks, deciding sets, comebacks, titles, form. */
export function PlayerStatsSection({ season, all, year, since }: { season: PlayerStats; all: PlayerStats; year: number; since: number | null }) {
  if (all.overall.w + all.overall.l === 0) return null;
  const surfaces = [...new Set([...all.bySurface.map((s) => s.surface)])];
  const rows: { label: string; a: WL; b: WL; extra?: boolean }[] = [
    { label: "All matches", a: season.overall, b: all.overall },
    ...surfaces.map((s) => ({
      label: s,
      a: season.bySurface.find((x) => x.surface === s) ?? { w: 0, l: 0 },
      b: all.bySurface.find((x) => x.surface === s) ?? { w: 0, l: 0 },
    })),
    { label: "Tiebreaks", a: season.tiebreaks, b: all.tiebreaks, extra: true },
    { label: "Deciding sets", a: season.decidingSets, b: all.decidingSets, extra: true },
  ];

  return (
    <section aria-labelledby="stats-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="stats-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Stats
      </h2>

      {all.form.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-muted">Last {all.form.length}</span>
          <ol className="flex gap-1" aria-label={`Last ${all.form.length} results, most recent first`}>
            {all.form.map((won, i) => (
              <li
                key={i}
                className={`inline-flex size-6 items-center justify-center rounded text-xs font-semibold ${won ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted"}`}
              >
                {won ? "W" : "L"}
                <span className="sr-only">{won ? " won" : " lost"}</span>
              </li>
            ))}
          </ol>
          {all.streak && all.streak.length > 1 && (
            <span className="text-muted">
              · {all.streak.length}-match {all.streak.won ? "winning" : "losing"} streak
            </span>
          )}
        </div>
      )}

      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th scope="col" className="py-1 font-medium">
              <span className="sr-only">Category</span>
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {year}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Since {since ?? "tracking"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label} className={r.extra ? "text-muted" : ""}>
              <th scope="row" className="py-1.5 text-left font-normal">
                {r.label}
              </th>
              <td className="py-1.5 text-right">
                {record(r.a)} <span className="text-xs text-muted">{pct(r.a)}</span>
              </td>
              <td className="py-1.5 text-right">
                {record(r.b)} <span className="text-xs text-muted">{pct(r.b)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm">
        <span className="font-semibold">{all.titles}</span> <span className="text-muted">titles and</span>{" "}
        <span className="font-semibold">{all.comebacks}</span> <span className="text-muted">comeback wins (after losing the first set) since {since ?? "tracking began"}.</span>
      </p>
    </section>
  );
}
