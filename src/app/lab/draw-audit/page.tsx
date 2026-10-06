import type { Metadata } from "next";
import Link from "next/link";

import { displayName } from "@/lib/data/tournaments";
import { createPublicClient } from "@/lib/supabase/public";
import type { DrawAuditCache } from "@/lib/sync/draw-audit";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Are the draws fair?",
  description:
    "A statistical audit of every tennis draw we hold: did the top seeds get easier first-round opponents than random placement would give? Hundreds of real draws, each tested against thousands of rule-following redraws.",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;

export default async function DrawAuditPage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:draw-audit").maybeSingle();
  const d = row?.data as unknown as DrawAuditCache | undefined;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Are the draws fair?</h1>
        <p className="text-sm text-muted">
          After the seeds are placed, every unseeded player (qualifiers and wildcards included) is meant to be drawn at random into the
          remaining lines. So the top seeds’ first-round opponents should look like a random sample of the unseeded field. For every draw
          we hold, we redraw the unseeded players thousands of times under those rules and ask: were the top eight seeds’ real
          opponents weaker than chance would give? Ratings are each player’s from the week before the event.
        </p>
      </div>

      {!d ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="verdict-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 id="verdict-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The verdict
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>
                <strong>No single draw stands out once you account for testing {d.draws} of them.</strong> {d.flagged === 0 ? "None" : d.flagged}{" "}
                {d.flagged === 1 ? "survives" : "survive"} a false-discovery-rate correction at 5%. With hundreds of draws, some will look
                lucky for the seeds by chance alone.
              </li>
              <li>
                <strong>Across all draws, a slight tilt:</strong> {pct(d.under05)} of draws gave the top seeds opponents weaker than 95% of
                random redraws, against 5% if every draw were random, and their opponents averaged {signed(d.meanGap)} rating points against
                the random expectation. Small, and it could come from known quirks (lucky losers take the lines of seeds who withdraw, and
                debutants without a rating count at the field’s median), not from anyone’s thumb on the scale.
              </li>
            </ul>
          </section>

          <section aria-labelledby="cat-heading" className="space-y-2">
            <h2 id="cat-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              By level
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Draw audit by tournament level</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Level</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Draws</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Lucky for seeds (p &lt; 0.05)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Opponents vs random</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.byCategory.map((c) => (
                    <tr key={c.category}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {c.category}
                      </th>
                      <td className="px-2 py-2 text-right text-muted">{c.draws}</td>
                      <td className="px-2 py-2 text-right">{pct(c.under05)}</td>
                      <td className="px-3 py-2 text-right">{signed(c.meanGap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Opponents vs random: rating points; negative means the top seeds’ opponents were weaker than random.</p>
          </section>

          <section aria-labelledby="lowest-heading" className="space-y-2">
            <h2 id="lowest-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The luckiest draws for the top seeds
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Draws where the top seeds’ first-round opponents were weakest against random redraws</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Draw</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Seeds tested</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Opponents vs random</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">p</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.results.slice(0, 12).map((r) => (
                    <tr key={r.tournamentId}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <Link href={`/tournaments/${r.tournamentId}/draw-report`} className="hover:underline">
                          {displayName(r.name)} {r.season}
                        </Link>{" "}
                        <span className="text-xs text-muted">{r.tour.toUpperCase()}</span>
                      </th>
                      <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{r.seeds}</td>
                      <td className="px-2 py-2 text-right">{signed(r.observed - r.expected)}</td>
                      <td className="px-3 py-2 text-right">{r.p.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              These are the most extreme of {d.draws} draws, which is exactly where chance puts some draws. Not significant after
              correcting for the number tested{d.flagged > 0 ? ` except ${d.flagged} (marked by the false-discovery-rate test)` : ""}.
            </p>
          </section>

          <p className="text-xs text-muted">
            Method: a permutation test per draw (2,000 rule-following redraws of the unseeded field, seed lines fixed), on the mean pre-event
            rating of the first-round opponents of seeds 1–8 without a bye; then a Benjamini–Hochberg correction across all draws. Brackets
            from Wikipedia; ratings from our results-based replay. A statistical check, not an accusation: it can show a pattern, not a
            cause. Updated weekly.
          </p>
        </>
      )}
    </div>
  );
}
