import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { displayName } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { TurnaroundsCache } from "@/lib/sync/turnarounds";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Greatest turnarounds",
  description:
    "Win chances after every set of every match since 2016, and the biggest turnarounds: the lowest odds anyone has come back from. Plus what losing the first set really does to a favourite.",
};

const pct = (p: number) => (p < 0.005 ? "<1%" : p >= 0.995 ? "99%+" : `${Math.round(p * 100)}%`);

export default async function TurnaroundsPage({ searchParams }: PageProps<"/lab/turnarounds">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:turnarounds").maybeSingle();
  const t = (row?.data as unknown as TurnaroundsCache | undefined)?.tours[tour];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Greatest turnarounds</h1>
          <p className="text-sm text-muted">
            The win chance after every set of every match since 2016. Each set moves the score and also what the day’s form looks like,
            so losing a set as the favourite says more than the scoreboard alone. The biggest turnarounds are the matches won from the
            lowest chance.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((x) => (
            <Link key={x} href={`/lab/turnarounds?tour=${x}`} aria-current={x === tour ? "page" : undefined} className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!t ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="greatest-heading" className="space-y-2">
            <h2 id="greatest-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Won from the lowest chance
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Matches won from the lowest win chance after any set, {TOUR_LABEL[tour]}</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Winner</th>
                    <th scope="col" className="hidden px-2 py-2 font-medium md:table-cell">Beat</th>
                    <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Event</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Low point</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.greatest.slice(0, 20).map((m) => (
                    <tr key={m.matchId}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Flag code={m.winner.country} reserve />
                          <Link href={`/matches/${m.matchId}`} className="hover:underline">
                            {m.winner.name}
                          </Link>
                        </span>
                      </th>
                      <td className="hidden px-2 py-2 md:table-cell">{m.loser.name}</td>
                      <td className="hidden px-2 py-2 text-muted sm:table-cell">
                        {displayName(m.tournament)} {m.season}
                        {m.round ? `, ${m.round}` : ""}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{pct(m.low)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right text-muted lg:table-cell">{m.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Low point: the winner’s lowest chance before the match or after any set.</p>
          </section>

          <section aria-labelledby="first-heading" className="space-y-2">
            <h2 id="first-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              When the favourite loses the first set
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">How often favourites still won after losing the first set, by their pre-match chance</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Favourite before the match</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Matches</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Still won</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Our chance</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Score alone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.afterFirstSet.map((b) => (
                    <tr key={b.bin}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {b.bin}
                      </th>
                      <td className="px-2 py-2 text-right text-muted">{b.matches.toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-right font-semibold">{pct(b.actual)}</td>
                      <td className="px-2 py-2 text-right">{pct(b.predicted)}</td>
                      <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{pct(b.scoreOnly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="max-w-2xl text-xs text-muted">
              Our chance learns from the set (the favourite may simply be off today); score alone treats the rest of the match as if
              nothing had been learned. Over {t.matches.toLocaleString("en-US")} matches, the chance after the first set scores a log
              loss of {t.logLoss.toFixed(3)} against {t.scoreOnlyLogLoss.toFixed(3)} for the score alone (lower is better).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
