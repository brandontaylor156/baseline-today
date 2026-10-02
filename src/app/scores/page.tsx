import type { Metadata } from "next";
import { connection, after } from "next/server";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { MatchCard } from "@/components/match-card";
import { getScores } from "@/lib/data/scores";
import { isStale } from "@/lib/data/scores-group";
import { liveScoresEnabled } from "@/lib/features";
import { TOUR_LABEL } from "@/lib/format";
import { provider } from "@/lib/provider";
import { TOURS } from "@/lib/provider/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshTour, STALE_IDLE_SECONDS, STALE_LIVE_SECONDS } from "@/lib/sync/matches";

export const metadata: Metadata = { title: "Scores" };

export default async function ScoresPage() {
  // Per request, before anything else: otherwise a build with the switch off prerenders a 404.
  await connection();
  if (!liveScoresEnabled()) notFound();

  const now = new Date();
  const { groups, freshness } = await getScores(now);
  const anyLive = groups.some((g) => g.live > 0);

  // Always render from the database; if it is stale, refresh after the response is sent so the
  // next view (or the 60-second auto-refresh) shows fresh scores. The lock dedupes viewers.
  if (!freshness.unauthorized && isStale(freshness.refreshedAt, anyLive, now, STALE_LIVE_SECONDS, STALE_IDLE_SECONDS)) {
    after(async () => {
      const db = createAdminClient();
      await Promise.all(TOURS.map((tour) => refreshTour(db, provider, tour)));
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scores</h1>
          <p className="text-sm text-muted">Live and today’s ATP and WTA singles</p>
        </div>
        <AutoRefresh refreshedAt={freshness.refreshedAt} />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          {freshness.unauthorized
            ? "Live scores are paused right now."
            : "No matches today. Check back when the next tournament starts."}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`t-${g.id}`} className="space-y-2">
            <h2 id={`t-${g.id}`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
              {g.name}
              <span className="text-xs font-normal text-muted">
                {TOUR_LABEL[g.tour]}
                {g.category ? ` · ${g.category}` : ""}
              </span>
              {g.live > 0 && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{g.live} live</span>
              )}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.matches.map((m) => (
                <li key={m.id}>
                  <MatchCard match={m} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
