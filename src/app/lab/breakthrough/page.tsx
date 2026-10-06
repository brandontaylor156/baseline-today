import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { createPublicClient } from "@/lib/supabase/public";
import type { BreakthroughCache } from "@/lib/sync/breakthrough";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Who breaks through next?",
  description:
    "Thousands of ATP Challenger results from Wikipedia joined to every tour result: each active Challenger player's chance of 10+ tour-level wins in the next two seasons, from a model tested on seasons it never saw.",
};

const pct = (x: number) => (x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export default async function BreakthroughPage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:breakthrough").maybeSingle();
  const d = row?.data as unknown as BreakthroughCache | undefined;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Who breaks through next?</h1>
        <p className="text-sm text-muted">
          Most future tour players are on the ATP Challenger Tour today. We read every Challenger draw on Wikipedia since 2016, replayed
          those results together with every tour result, and asked of each active Challenger player: will they win 10 or more tour-level
          matches over the next two seasons? The model learned from 2017–2022 and is scored on later seasons it never saw.
        </p>
      </div>

      {!d ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="prospects-heading" className="space-y-2">
            <h2 id="prospects-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Most likely to break through, from today
            </h2>
            <p className="max-w-2xl text-sm text-muted">First breakthroughs only: players with fewer than 10 tour-level wins in their careers so far.</p>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Active Challenger players most likely to win 10 or more tour-level matches in the next two seasons</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Player</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Age</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium md:table-cell">Challenger wins</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium md:table-cell">Titles</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium lg:table-cell">Rating (12-month change)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Chance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.prospects.filter((p) => p.careerTourWins < 10).slice(0, 25).map((p) => (
                    <tr key={p.key}>
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
                      <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{p.age === null ? "–" : Math.floor(p.age)}</td>
                      <td className="hidden px-2 py-2 text-right md:table-cell">{p.challengerWins}</td>
                      <td className="hidden px-2 py-2 text-right md:table-cell">{p.titles}</td>
                      <td className="hidden px-2 py-2 text-right text-muted lg:table-cell">
                        {p.rating} ({p.gain >= 0 ? "+" : "−"}
                        {Math.abs(p.gain)})
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{pct(p.chance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              Active: 10 or more Challenger matches and fewer than 5 tour-level wins in the last 12 months. Chance: 10+ tour-level wins
              (main draws of tour events and Grand Slams) in the next two seasons.
            </p>
          </section>

          {d.prospects.some((p) => p.careerTourWins >= 10) && (
            <section aria-labelledby="return-heading" className="space-y-2">
              <h2 id="return-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                On the way back
              </h2>
              <p className="max-w-2xl text-sm text-muted">Players who have won on the tour before and are back on the Challengers: their chance of 10+ tour-level wins again.</p>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
                {d.prospects
                  .filter((p) => p.careerTourWins >= 10)
                  .slice(0, 10)
                  .map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
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
                      <span className="shrink-0 text-muted tabular-nums">
                        {p.careerTourWins} career tour wins · <strong className="text-foreground">{pct(p.chance)}</strong>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="test-heading" className="space-y-3">
            <h2 id="test-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Does it work?
            </h2>
            <p className="max-w-2xl text-sm">
              Scored on the start of {d.test.seasons.join(" and ")} ({d.test.candidates.toLocaleString("en-US")} active Challenger players,{" "}
              {d.test.breakthroughs} of whom broke through): it ranks a real breakthrough above a non-breakthrough{" "}
              <strong>{pct(d.test.auc)}</strong> of the time (AUC), against {pct(d.test.ratingAuc)} for the rating alone. Brier score{" "}
              {d.test.brier.toFixed(3)} against {d.test.ratingBrier.toFixed(3)} (lower is better).
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">Calibration on held-out seasons: chance given against how often players broke through</caption>
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Chance given</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Players</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Broke through</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.test.bins.map((b) => (
                      <tr key={b.predicted}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {pct(b.predicted)} on average
                        </th>
                        <td className="px-2 py-2 text-right text-muted">{b.n}</td>
                        <td className="px-3 py-2 text-right font-semibold">{pct(b.actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs text-muted">The highest chances it gave in held-out seasons</h3>
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
                  {d.hits.slice(0, 10).map((h) => (
                    <li key={`${h.name}-${h.season}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        {h.name} <span className="text-xs text-muted">from {h.season}</span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${h.broke ? "text-up" : "text-down"}`}>
                        {pct(h.chance)} · {h.broke ? "broke through" : "didn’t"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section aria-labelledby="weights-heading" className="max-w-2xl space-y-2">
            <h2 id="weights-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              What the model leans on
            </h2>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {[...d.weights]
                .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
                .map((w) => (
                  <li key={w.feature} className="flex justify-between gap-3 border-b border-border py-1">
                    <span>{w.feature}</span>
                    <span className="tabular-nums text-muted">
                      {w.weight >= 0 ? "+" : "−"}
                      {Math.abs(w.weight).toFixed(2)}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="text-xs text-muted">Change in log-odds per standard deviation of each feature, with the others held fixed.</p>
          </section>

          <p className="text-xs text-muted">
            {d.challengerResults.toLocaleString("en-US")} ATP Challenger results from Wikipedia draw pages (CC BY-SA 4.0), dated from each
            event’s article; tour results as everywhere on the site. Ratings: one margin-of-victory Elo replay over both. Ages from player
            records and Wikidata where known. A logistic regression, trained on 2017–2022 season starts. Updated weekly.
          </p>
        </>
      )}
    </div>
  );
}
