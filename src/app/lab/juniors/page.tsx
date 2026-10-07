import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { createPublicClient } from "@/lib/supabase/public";
import type { Junior, JuniorsCache } from "@/lib/sync/juniors";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "From junior Slams to the pros",
  description:
    "Every junior Grand Slam singles draw since 2015, followed into the pros: how often junior champions, finalists and first-round losers go on to win on the tour, and what became of every junior Slam champion.",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Champions({ rows, gender }: { rows: Junior[]; gender: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{`Junior Grand Slam ${gender} champions since 2015 and their pro records`}</caption>
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Champion</th>
            <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Junior title</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Tour wins</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{gender === "boys" ? "Challenger wins" : ""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((j) => (
            <tr key={j.name}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag code={j.country} reserve />
                  {j.id ? (
                    <Link href={`/players/${j.id}`} className="hover:underline">
                      {j.name}
                    </Link>
                  ) : (
                    <span>{j.name}</span>
                  )}
                </span>
              </th>
              <td className="hidden px-2 py-2 text-muted sm:table-cell">{j.titles.join(", ").replace(/ Championships/g, "")}</td>
              <td className={`px-2 py-2 text-right ${j.tourWins >= 10 ? "font-semibold text-up" : ""}`}>{j.tourWins}</td>
              <td className="px-3 py-2 text-right text-muted">{gender === "boys" ? j.challengerWins : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function JuniorsPage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:juniors").maybeSingle();
  const d = row?.data as unknown as JuniorsCache | undefined;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">From junior Slams to the pros</h1>
        <p className="text-sm text-muted">
          Every boys’ and girls’ singles draw at the four Grand Slams since 2015, read from Wikipedia, with each junior followed into
          the pro results we track. Making it: 10 or more tour-level match wins so far (WTA 125 and Challenger events don’t count).
        </p>
      </div>

      {!d ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="conv-heading" className="space-y-3">
            <h2 id="conv-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              How often juniors make it, by their best junior Slam result
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Share of juniors reaching 10 or more tour-level wins, by best junior Grand Slam result</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Best junior Slam result</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Boys</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Girls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.conversion.boys.map((b, i) => {
                    const g = d.conversion.girls[i];
                    return (
                      <tr key={b.stage}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {b.stage === "Champion" || b.stage === "Finalist" ? b.stage : `Lost in the ${b.stage.toLowerCase()}`}
                        </th>
                        {[b, g].map((x, j) => (
                          <td key={j} className="px-3 py-2 text-right">
                            <strong>{x.players ? pct(x.made / x.players) : "–"}</strong>{" "}
                            <span className="text-xs text-muted">
                              ({x.made} of {x.players})
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="max-w-2xl text-xs text-muted">
              Juniors whose last junior Slam was in {d.cohortUntil} or earlier, so everyone counted has had at least five seasons to
              make it. Small groups at the top: read the champion and finalist rows as rough.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="boys-heading" className="space-y-2">
              <h2 id="boys-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Boys’ champions since 2015
              </h2>
              <Champions rows={d.champions.boys} gender="boys" />
            </section>
            <section aria-labelledby="girls-heading" className="space-y-2">
              <h2 id="girls-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Girls’ champions since 2015
              </h2>
              <Champions rows={d.champions.girls} gender="girls" />
            </section>
          </div>

          <p className="text-xs text-muted">
            {d.draws} junior draws from Wikipedia (CC BY-SA 4.0), linked to pro results by the same Wikipedia names. Tour wins count from
            2015 in the results we track; a few early careers began before that. Recent champions haven’t had time yet.
          </p>
        </>
      )}
    </div>
  );
}
