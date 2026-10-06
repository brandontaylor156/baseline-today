import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { formatDate, isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  SeasonOutlookCache,
  SeasonOutlookRow,
} from "@/lib/sync/season-outlook";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Season simulator",
  description:
    "The rest of the tennis season played out thousands of times: every remaining event, who enters, the draws, every match, points won and dropped. Each player's chance of the Finals, year-end No. 1 and the top 10, backtested on 2025.",
};

const FINALS: Record<Tour, string> = { atp: "ATP Finals", wta: "WTA Finals" };
const pct = (p: number) =>
  p >= 0.995
    ? "99%+"
    : p === 0
      ? "–"
      : p < 0.005
        ? "<1%"
        : `${Math.round(p * 100)}%`;
const n = (x: number) => Math.round(x).toLocaleString("en-US");

function Who({ p }: { p: SeasonOutlookRow }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={p.country} reserve />
      <Link href={`/players/${p.id}`} className="hover:underline">
        {p.name}
      </Link>
    </span>
  );
}

export default async function SeasonPage({
  searchParams,
}: PageProps<"/lab/season">) {
  const q = await searchParams;
  const tour: Tour =
    typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data } = await createPublicClient()
    .from("stat_cache")
    .select("data")
    .eq("key", `season:${tour}`)
    .maybeSingle();
  const s = data?.data as unknown as SeasonOutlookCache | undefined;
  const players = s?.players ?? [];
  const no1 = [...players]
    .filter((p) => p.no1 >= 0.005)
    .sort((a, b) => b.no1 - a.no1);
  const locked = players.filter((p) => p.finals >= 0.995).length;
  const contenders = players.filter(
    (p) => p.finals >= 0.005 && p.finals < 0.995,
  );
  const table = players
    .filter((p) => p.finals >= 0.005 || p.top10 >= 0.005)
    .slice(0, 25);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link
            href="/lab"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Season simulator
          </h1>
          <p className="text-sm text-muted">
            The rest of the {s?.season ?? ""} season played out{" "}
            {s ? n(s.sims) : "thousands of"} times. Every remaining event on the
            calendar: who enters, the seeded draw, every match from the model’s
            ratings, the points won and last year’s points dropping off. Then
            the {FINALS[tour]}.
          </p>
        </div>
        <nav
          aria-label="Tour"
          className="flex overflow-hidden rounded-lg border border-border text-sm"
        >
          {(["atp", "wta"] as const).map((t) => (
            <Link
              key={t}
              href={`/lab/season?tour=${t}`}
              aria-current={t === tour ? "page" : undefined}
              className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}
            >
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      {!s || players.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          The simulator runs daily until the {FINALS[tour]} begin; check back
          soon.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">Year-end No. 1</dt>
              <dd className="mt-1 space-y-0.5">
                {no1.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate text-sm">{p.name}</span>
                    <span className="font-semibold tabular-nums">
                      {pct(p.no1)}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">
                {FINALS[tour]} places settled
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {locked}{" "}
                <span className="text-base font-normal text-muted">of 8</span>
              </dd>
              <dd className="text-xs text-muted">
                {contenders.length} players still in it
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">Still to play</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {s.events.length}{" "}
                <span className="text-base font-normal text-muted">events</span>
              </dd>
              <dd className="text-xs text-muted">
                {s.finalsStart
                  ? `${FINALS[tour]} from ${formatDate(s.finalsStart)}`
                  : ""}
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">
                {TOUR_LABEL[tour]} season simulator: each player’s chances and
                projected year-end points
              </caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Player
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-2 text-right font-medium sm:table-cell"
                  >
                    Race
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-2 text-right font-medium md:table-cell"
                  >
                    Ranking pts
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-2 text-right font-medium md:table-cell"
                  >
                    Dropping
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Finals
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    No. 1
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Top 10
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium lg:table-cell"
                  >
                    Year-end points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {table.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Who p={p} />
                    </th>
                    <td className="hidden px-2 py-2 text-right sm:table-cell">
                      {n(p.racePoints)}
                    </td>
                    <td className="hidden px-2 py-2 text-right md:table-cell">
                      {n(p.points)}
                    </td>
                    <td className="hidden px-2 py-2 text-right text-muted md:table-cell">
                      {p.dropping ? `−${n(p.dropping)}` : "–"}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {pct(p.finals)}
                    </td>
                    <td className="px-2 py-2 text-right">{pct(p.no1)}</td>
                    <td className="px-2 py-2 text-right">{pct(p.top10)}</td>
                    <td className="hidden px-3 py-2 text-right text-muted lg:table-cell">
                      {n(p.ranking[0])}–{n(p.ranking[2])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Race: points this season (the top 8 qualify). Ranking points: the
            latest ranking ({formatDate(s.rankingDate)}) plus results since.
            Dropping: last year’s points still to come off before the year ends,
            including last year’s Finals. Year-end points: the middle 80% of
            simulated finishes.
          </p>

          <section aria-labelledby="calendar-heading" className="space-y-2">
            <h2
              id="calendar-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Still to play
            </h2>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {s.events
                .filter((e) => !/125/.test(e.category))
                .map((e) => (
                  <li
                    key={`${e.week}-${e.name}`}
                    className="flex justify-between gap-3 border-b border-border py-1.5"
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="shrink-0 text-muted">
                      {e.category} · {formatDate(e.week)}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}

      {s?.backtest && s.backtest.length > 0 && (
        <section aria-labelledby="backtest-heading" className="space-y-3">
          <h2
            id="backtest-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            Does it work? {s.season - 1}, replayed
          </h2>
          <p className="max-w-2xl text-sm text-muted">
            We ran the simulator from three dates in {s.season - 1} using only
            what was known then (the ranking and ratings of that week, results
            already finished; events in progress were played from scratch) and
            compared it with what happened. The score is the Brier score of the
            Finals chances for the top 30 of the race (lower is better), against
            simply assuming the current top 8 qualify.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {s.backtest.map((b) => (
              <div
                key={b.asOf}
                className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <h3 className="font-semibold">From {formatDate(b.asOf)}</h3>
                <p className="text-muted">
                  Score{" "}
                  <strong className="text-foreground tabular-nums">
                    {b.brier.toFixed(3)}
                  </strong>{" "}
                  vs {b.baseline.toFixed(3)} for the current top 8.
                  {b.no1 && (
                    <>
                      {" "}
                      Year-end No. 1 {b.no1.name}: given {pct(b.no1.chance)}.
                    </>
                  )}
                </p>
                <div>
                  <h4 className="text-xs text-muted">
                    Qualified (chance given)
                  </h4>
                  <p className="tabular-nums">
                    {b.qualifiers
                      .map(
                        (x) => `${x.name.split(" ").at(-1)} ${pct(x.chance)}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
                {b.missed.length > 0 && (
                  <div>
                    <h4 className="text-xs text-muted">Didn’t qualify</h4>
                    <p className="tabular-nums">
                      {b.missed
                        .map(
                          (x) => `${x.name.split(" ").at(-1)} ${pct(x.chance)}`,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        Entries come from each player’s habits (last year’s edition, how often
        they’ve played that level this season, and recent activity); the ranking
        cut fills each draw and qualifiers make up the rest. Estimates: the
        tours count a player’s best results only, Grand Slam champions ranked
        9–20 have a special route to the ATP Finals, and withdrawals aren’t
        known in advance. Updated daily. Not betting advice.
      </p>
    </div>
  );
}
