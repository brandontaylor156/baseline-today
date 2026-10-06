import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { MomentumCache, ResilienceRow } from "@/lib/sync/momentum";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Does momentum exist?",
  description:
    "Coin-flip tiebreaks as a natural experiment: does winning a tiebreak 8–6 carry into the next set? Thousands of real tiebreaks, each checked against what the in-match model already expected.",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

function Players({ rows, caption }: { rows: ResilienceRow[]; caption: string }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm" aria-label={caption}>
      {rows.map((r) => (
        <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Flag code={r.country} reserve />
            {r.id ? (
              <Link href={`/players/${r.id}`} className="hover:underline">
                {r.name}
              </Link>
            ) : (
              <span>{r.name}</span>
            )}
          </span>
          <span className="shrink-0 text-muted tabular-nums">
            {pts(r.bounce)} · {r.cases} tiebreaks
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function MomentumPage({ searchParams }: PageProps<"/lab/momentum">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:momentum").maybeSingle();
  const t = (row?.data as unknown as MomentumCache | undefined)?.tours[tour];
  const coin = t?.groups.find((g) => g.key === "coin");
  const clear = t?.groups.find((g) => g.key === "clear");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Does momentum exist?</h1>
          <p className="text-sm text-muted">
            A tiebreak that ends 8–6 or 10–8 is close to a coin flip, which makes it a natural experiment: if winning one gives a player
            momentum, they should win the next set more often than the scoreboard and their level explain. Every tiebreak since 2016 that
            wasn’t the last set, checked against the in-match model (which already reads each set as evidence of form).
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((x) => (
            <Link key={x} href={`/lab/momentum?tour=${x}`} aria-current={x === tour ? "page" : undefined} className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!t || !coin || !clear ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="verdict-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm sm:p-5">
            <h2 id="verdict-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The verdict
            </h2>
            <p>
              After winning a coin-flip tiebreak, players won the next set <strong>{pct(coin.actual)}</strong> of the time; the model
              expected {pct(coin.expected)}.{" "}
              {coin.gap + 1.96 * coin.se < 0
                ? "Less than expected: a lucky tiebreak carries less than any other won set, so there’s no momentum to find."
                : coin.gap - 1.96 * coin.se > 0
                  ? "More than expected: evidence of real momentum."
                  : "Within noise: no sign of momentum beyond what the score already says."}
            </p>
            <p>
              After a clear tiebreak win (7–3 or wider) it was {pct(clear.actual)} against {pct(clear.expected)} expected: winning a
              tiebreak comfortably says something about the day; winning one narrowly doesn’t.
            </p>
          </section>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Next set won by the tiebreak winner, by how tight the tiebreak was</caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Tiebreak</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Cases</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Won next set</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Expected</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gap (95%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {t.groups.map((g) => (
                  <tr key={g.key}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {g.label}
                    </th>
                    <td className="px-2 py-2 text-right text-muted">{g.cases.toLocaleString("en-US")}</td>
                    <td className="px-2 py-2 text-right font-semibold">{pct(g.actual)}</td>
                    <td className="px-2 py-2 text-right">{pct(g.expected)}</td>
                    <td className="px-3 py-2 text-right">
                      {pts(g.gap)} <span className="text-xs text-muted">(±{(g.se * 196).toFixed(1)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section aria-labelledby="bounce-heading" className="space-y-2">
            <h2 id="bounce-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Bouncing back from a tight tiebreak loss
            </h2>
            <p className="max-w-2xl text-sm text-muted">
              Is bouncing back a skill? Players’ records after losing tight tiebreaks in 2016–2020 against 2021 on correlate{" "}
              {t.persistence.r.toFixed(2)} ({t.persistence.players} players with ten or more in each period).{" "}
              {Math.abs(t.persistence.r) < 0.2 ? "It doesn’t carry over, so the lists below are mostly luck." : "Some of it carries over."}
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1">
                <h3 className="text-xs text-muted">Best next sets after a tight tiebreak loss (points vs expected)</h3>
                <Players rows={t.bouncers} caption="Players who did best in the set after losing a tight tiebreak" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs text-muted">Worst</h3>
                <Players rows={t.sinkers} caption="Players who did worst in the set after losing a tight tiebreak" />
              </div>
            </div>
          </section>

          <p className="text-xs text-muted">
            Tiebreak points from the Wikipedia draws. Expected: the chance of winning the next set from the pre-match chance and every set
            so far, with the day’s form updated after each set. Completed matches only. After Meier et al. (2020) and Depken et al. (2022),
            who studied momentum with point and set data.
          </p>
        </>
      )}
    </div>
  );
}
