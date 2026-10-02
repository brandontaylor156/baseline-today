import type { Metadata } from "next";
import Link from "next/link";
import { after, connection } from "next/server";

import { AutoRefresh } from "@/components/auto-refresh";
import { MatchCard } from "@/components/match-card";
import { WikiCredit } from "@/components/wiki-credit";
import { getRecentResults } from "@/lib/data/results";
import { displayName } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshResults, RESULTS_STALE_MINUTES, STABLE_MINUTES } from "@/lib/sync/wiki-results";

export const metadata: Metadata = {
  title: "Results",
  description: "Finished ATP and WTA singles matches from the last few days.",
};

export default async function ResultsPage() {
  await connection();
  const now = new Date();
  const { groups, refreshedAt } = await getRecentResults(now);

  // Render from the database; refresh in the background when it's getting old.
  if (!refreshedAt || now.getTime() - Date.parse(refreshedAt) > RESULTS_STALE_MINUTES * 60 * 1000) {
    after(() => refreshResults(createAdminClient()));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Results</h1>
          <p className="text-sm text-muted">Finished singles matches, usually within half an hour. Not live.</p>
        </div>
        <AutoRefresh refreshedAt={refreshedAt} />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          No results from the last few days yet. They appear here once tournament draws are updated.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`r-${g.id}`} className="space-y-2">
            <h2 id={`r-${g.id}`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
              <Link href={`/tournaments/${g.id}`} className="hover:underline">
                {displayName(g.name)}
              </Link>
              <span className="text-xs font-normal text-muted">
                {TOUR_LABEL[g.tour]}
                {g.category ? ` · ${g.category}` : ""}
              </span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.results.map((r) => (
                <li key={r.id}>
                  <MatchCard match={r} />
                </li>
              ))}
            </ul>
            <WikiCredit sources={g.sources} />
          </section>
        ))
      )}

      <p className="text-xs text-muted">
        Results are read from volunteer-edited Wikipedia draws and shown once the page has been unchanged for{" "}
        {STABLE_MINUTES} minutes, which filters out half-finished edits and most vandalism.
      </p>
    </section>
  );
}
