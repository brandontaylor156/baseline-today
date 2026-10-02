import Link from "next/link";

import type { TimelineRow } from "@/lib/timeline";

const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const titleCase = (name: string) => (name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'(-])\p{L}/gu, (c) => c.toUpperCase()) : name);

/** One row per tournament this season: how far the player went and who stopped them. */
export function PlayerTimeline({ rows, year }: { rows: TimelineRow[]; year: number }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="timeline-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="timeline-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {year} tournaments
      </h2>
      <ol className="divide-y divide-border text-sm">
        {rows.map((r) => (
          <li key={r.tournamentId} className="flex items-center gap-3 py-2">
            <span className="w-9 shrink-0 text-xs text-muted">{month(r.date)}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/tournaments/${r.tournamentId}`} className="block truncate font-medium hover:underline">
                {titleCase(r.name)}
              </Link>
              <span className="block truncate text-xs text-muted">
                {r.champion ? (
                  <span className="font-medium text-accent">🏆 Champion</span>
                ) : (
                  <>
                    {r.reached ?? "Main draw"}
                    {r.lostTo && (
                      <>
                        {" · lost to "}
                        {r.lostTo.id !== null ? (
                          <Link href={`/players/${r.lostTo.id}`} className="hover:underline">
                            {r.lostTo.name}
                          </Link>
                        ) : (
                          r.lostTo.name
                        )}
                      </>
                    )}
                  </>
                )}
                {r.surface ? ` · ${r.surface}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {r.w}–{r.l}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
