import type { Metadata } from "next";
import Link from "next/link";

import { ComebackChart } from "@/components/comeback-chart";
import { Flag } from "@/components/flag";
import { formatDate, isTour, TOUR_LABEL } from "@/lib/format";
import { GAP_BUCKETS } from "@/lib/lab/comebacks";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { ComebackPlayer, ComebacksCache } from "@/lib/sync/factors";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Comeback curves",
  description:
    "How tennis players perform after injuries and long absences, event by event back, measured against their ratings on every return since 2016. Plus who is coming back right now.",
};

const COLORS = [
  "var(--chart-line)",
  "var(--chart-line-2)",
  "var(--chart-line-3)",
];
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}`;

function PlayerTable({
  rows,
  caption,
  recent,
}: {
  rows: ComebackPlayer[];
  caption: string;
  recent: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Player
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Back
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Out
            </th>
            <th
              scope="col"
              className="hidden px-2 py-2 text-right font-medium sm:table-cell"
            >
              {recent ? "Events since" : "Matches"}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Vs rating
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={`${p.key}-${p.date}`}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
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
              </th>
              <td className="px-2 py-2 text-right text-muted">
                {formatDate(p.date)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{p.weeks} wk</td>
              <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">
                {recent ? p.events : p.matches}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${Math.abs(p.shift) < 15 ? "" : p.shift > 0 ? "text-up" : "text-down"}`}
              >
                {signed(p.shift)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ComebacksPage({
  searchParams,
}: PageProps<"/lab/comebacks">) {
  const q = await searchParams;
  const tour: Tour =
    typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data: row } = await createPublicClient()
    .from("stat_cache")
    .select("data")
    .eq("key", "lab:comebacks")
    .maybeSingle();
  const t = (row?.data as unknown as ComebacksCache | undefined)?.tours[tour];
  const long = t?.curves["26+"];

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
            Comeback curves
          </h1>
          <p className="text-sm text-muted">
            Every return from eight weeks or more away since 2016 (the
            off-season and the 2020 suspension don’t count), and how the player
            did in each event back against what their rating said.
          </p>
        </div>
        <nav
          aria-label="Tour"
          className="flex overflow-hidden rounded-lg border border-border text-sm"
        >
          {(["atp", "wta"] as const).map((x) => (
            <Link
              key={x}
              href={`/lab/comebacks?tour=${x}`}
              aria-current={x === tour ? "page" : undefined}
              className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}
            >
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!t || !long ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          Computed weekly; check back soon.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="curve-heading"
            className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
          >
            <h2
              id="curve-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Rating points above or below their rating, event by event back
            </h2>
            <ComebackChart series={GAP_BUCKETS.map((b, i) => ({ label: b.label, color: COLORS[i], points: t.curves[b.key] }))} />
            <p className="text-sm">
              After half a year or more away, players play about{" "}
              <strong>{Math.abs(Math.round(long[0].shift))} points</strong>{" "}
              below their rating in their first event back and{" "}
              {Math.abs(Math.round(long[1].shift))} in the second, and are back
              to normal by about the fourth. Shorter breaks cost much less.
            </p>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Show as table
              </summary>
              <table className="mt-2 w-full text-left tabular-nums">
                <caption className="sr-only">
                  Rating shift by event back and length of layoff
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-1 font-medium">
                      Event back
                    </th>
                    {GAP_BUCKETS.map((b) => (
                      <th
                        key={b.key}
                        scope="col"
                        className="py-1 text-right font-medium"
                      >
                        {b.label} ({t.returns[b.key]} returns)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {long.map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <th scope="row" className="py-1 font-normal">
                        {i + 1}
                      </th>
                      {GAP_BUCKETS.map((b) => {
                        const p = t.curves[b.key][i];
                        return (
                          <td
                            key={b.key}
                            className="py-1 text-right text-foreground"
                          >
                            {signed(p.shift)}{" "}
                            <span className="text-muted">
                              ({signed(p.low)} to {signed(p.high)})
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          {t.current.length > 0 && (
            <section aria-labelledby="current-heading" className="space-y-2">
              <h2
                id="current-heading"
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                Back in the last four months
              </h2>
              <PlayerTable
                rows={t.current}
                caption="Players back from a layoff in the last four months, and how they have done against their rating"
                recent
              />
            </section>
          )}

          <section aria-labelledby="best-heading" className="space-y-2">
            <h2
              id="best-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              The strongest returns from half a year or more away
            </h2>
            <PlayerTable
              rows={t.best}
              caption="The strongest returns from half a year or more away, first three events back"
              recent={false}
            />
          </section>

          <p className="text-xs text-muted">
            Vs rating: the rating shift that makes the model’s pre-match chances
            match the results, over the first three events back (players) or
            each event back (curves), shrunk toward zero for players with few
            matches. Returns are found from gaps between tournaments in the
            results we track, so a player who only skipped events we don’t cover
            may appear as a return. Ratings freeze while a player is away, which
            is exactly why the first events back are mispriced.
          </p>
        </>
      )}
    </div>
  );
}
