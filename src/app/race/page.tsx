import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { getRace } from "@/lib/data/race";
import { getSeasonTournaments } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { countsForRace, resultsWorth } from "@/lib/points";
import { TOURS, type Tour } from "@/lib/provider/types";

export const metadata: Metadata = {
  title: "Season race",
  description: "Estimated ATP and WTA season points from tracked results, with projections for tournaments in progress.",
};

const FINALS: Record<Tour, string> = { atp: "the ATP Finals in Turin", wta: "the WTA Finals in Riyadh" };
const SPOTS = 8;
const SHOWN = 30;

function chance(p: number): string {
  if (p >= 0.995) return "99%+";
  if (p > 0 && p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export default async function RacePage({ searchParams }: PageProps<"/race">) {
  const q = await searchParams;
  const tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const season = new Date().getUTCFullYear();
  const [{ rows, live, events, qualify, weeksLeft }, calendar] = await Promise.all([getRace(tour, season), getSeasonTournaments(season)]);
  // What it takes: the gap to the last qualifying place, against the events still to start.
  const today = new Date().toISOString().slice(0, 10);
  const finalsStart = calendar.find((t) => t.tour === tour && /finals/i.test(t.category ?? ""))?.startDate ?? `${season}-11-08`;
  const upcoming = calendar.filter((t) => t.tour === tour && countsForRace(tour, t.category) && t.startDate && t.startDate > today && t.startDate < finalsStart);
  const line = rows[SPOTS - 1];
  const chasers = line ? rows.slice(SPOTS, SPOTS + 6).map((r) => ({ r, gap: Math.round(line.projected - r.projected) + 1 })) : [];
  const top = rows.slice(0, SHOWN);
  const showProjection = live > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{season} season race</h1>
          <p className="text-sm text-muted">
            Estimated {TOUR_LABEL[tour]} points this season. The top {SPOTS} qualify for {FINALS[tour]}.
          </p>
        </div>
        <nav aria-label="Tour" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {TOURS.map((t) => (
            <Link
              key={t}
              href={`/race?tour=${t}`}
              aria-current={t === tour ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${t === tour ? "bg-accent font-medium text-background" : "text-muted hover:text-foreground"}`}
            >
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {TOUR_LABEL[tour]} season race, estimated points{showProjection ? " and projection" : ""}
          </caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 text-right font-medium">
                #
              </th>
              <th scope="col" className="w-full px-2 py-2 font-medium">
                Player
              </th>
              <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-medium sm:table-cell">
                Events
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                Points
              </th>
              {showProjection && (
                <th scope="col" className="hidden whitespace-nowrap px-3 py-2 text-right font-medium sm:table-cell">
                  Projected
                </th>
              )}
              {qualify && (
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  Finals chance
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={r.key} className={i === SPOTS ? "border-t-2 border-dashed border-accent" : "border-t border-border"}>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{i + 1}</td>
                <td className="max-w-0 px-2 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Flag code={r.country} reserve />
                    {r.id !== null ? (
                      <Link href={`/players/${r.id}`} className="truncate hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="truncate">{r.name}</span>
                    )}
                  </span>
                </td>
                <td className="hidden px-2 py-2 text-right tabular-nums text-muted sm:table-cell">{r.events}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.points.toLocaleString("en-US")}</td>
                {showProjection && (
                  <td className="hidden px-3 py-2 text-right tabular-nums text-muted sm:table-cell">
                    {r.projected > r.points ? r.projected.toLocaleString("en-US") : "–"}
                  </td>
                )}
                {qualify && (
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {chance(qualify.get(r.key) ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chasers.length > 0 && (
        <section aria-labelledby="takes-heading" className="space-y-2">
          <h2 id="takes-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            What it takes to reach the top {SPOTS}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {chasers.map(({ r, gap }) => {
              const options = resultsWorth(tour, gap, upcoming.map((t) => t.category!)).slice(0, 3);
              return (
                <li key={r.key} className="space-y-0.5 px-4 py-2.5">
                  <p>
                    <span className="font-medium">{r.name}</span> needs <span className="font-semibold tabular-nums">{gap.toLocaleString("en-US")}</span> more points
                    to pass {line.name} (#{SPOTS}), if nobody else scores.
                  </p>
                  <p className="text-xs text-muted">
                    {options.length > 0
                      ? `In one event: ${options.map((o) => `${/^ATP/.test(o.category) ? "an" : "a"} ${o.category} ${o.result} (${o.points})`).join(", or ")}.`
                      : upcoming.length > 0
                        ? "More than any single event left is worth: it takes several deep runs."
                        : "No counting events left before the Finals."}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            {upcoming.length} counting event{upcoming.length === 1 ? "" : "s"} still to start before the Finals. Gaps use projected points; rivals
            scoring too makes the real bar higher.
          </p>
        </section>
      )}

      <div className="space-y-1 text-xs text-muted">
        <p>
          The dashed line marks the {SPOTS} qualifying places. Projected adds each player’s expected points from the {live} tournament
          {live === 1 ? "" : "s"} in progress, using our model’s chances to go further.
        </p>
        {qualify && (
          <p>
            Finals chance: how often a player finishes in the top {SPOTS} across 4,000 simulated finishes to the season ({weeksLeft}{" "}
            week{weeksLeft === 1 ? "" : "s"} left). Events in progress end according to our model; after that, each player keeps
            playing at their season rate and scores like one of their own events this season. A rough guide only.
          </p>
        )}
        <p>
          An estimate, not the tours’ own race: points come from our table for each category and round, across the {events}{" "}
          {TOUR_LABEL[tour]} events we track this season. It counts every event (the tours count a player’s best results only), skips
          qualifying, team events and the Finals, and can miss results Wikipedia doesn’t have.
        </p>
      </div>
    </div>
  );
}
