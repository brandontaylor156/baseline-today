import Link from "next/link";
import { notFound } from "next/navigation";

import { getRankingDates, getRankings } from "@/lib/data/tennis";
import { formatPoints, TOUR_LABEL, TOUR_NAME } from "@/lib/format";
import { TOURS, type Tour } from "@/lib/provider/types";

import { DateSelect } from "./date-select";
import { Movement } from "./movement";
import { PlayerAvatar } from "./player-avatar";

export async function RankingsView({ tour, date }: { tour: Tour; date?: string }) {
  const dates = await getRankingDates(tour);
  const selected = date ?? dates[0];
  if (date && !dates.includes(date)) notFound();

  const rows = selected ? await getRankings(tour, selected) : [];
  const basePath = `/rankings/${tour}`;

  return (
    <section aria-labelledby="rankings-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="rankings-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {TOUR_LABEL[tour]} rankings
          </h1>
          <p className="text-sm text-muted">{TOUR_NAME[tour]} · top {rows.length || 100}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Tour" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {TOURS.map((t) => (
              <Link
                key={t}
                href={`/rankings/${t}`}
                aria-current={t === tour ? "page" : undefined}
                className={`rounded-md px-3 py-1 ${t === tour ? "bg-accent text-background font-medium" : "text-muted hover:text-foreground"}`}
              >
                {TOUR_LABEL[t]}
              </Link>
            ))}
          </nav>
          {selected && <DateSelect basePath={basePath} dates={dates} value={selected} />}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-muted">
          No rankings stored yet. They appear after the first daily sync.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="w-14 px-2 py-2 text-center sm:w-24 sm:px-3">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2">
                  Player
                </th>
                <th scope="col" className="w-[4.5rem] px-2 py-2 text-right sm:w-28 sm:px-3">
                  Points
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.player.id} className="hover:bg-surface-muted/60">
                  <td className="px-2 py-2 sm:px-3">
                    <span className="flex flex-col items-center leading-tight sm:flex-row sm:justify-center sm:gap-2">
                      <span className="font-semibold tabular-nums">{r.rank}</span>
                      <Movement value={r.movement} />
                    </span>
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <Link href={`/players/${r.player.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline sm:gap-3">
                      <PlayerAvatar name={r.player.fullName} image={r.player.image} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.player.fullName}</span>
                        {r.player.countryCode && <span className="block text-xs text-muted">{r.player.countryCode}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted sm:px-3">{formatPoints(r.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
