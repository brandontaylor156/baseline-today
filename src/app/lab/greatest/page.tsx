import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { displayName } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The greatest matches since 2015",
  description: "Every ATP and WTA match since 2015 scored for quality: both players' strength going in, the drama (deciding sets, tiebreaks, margins) and the stakes. The best of the decade and of each season.",
};

type Great = {
  match_id: number;
  season: number;
  tournament_id: number;
  tournament: string;
  category: string | null;
  round: string | null;
  winner_id: number;
  winner: string;
  winner_country: string | null;
  loser_id: number;
  loser: string;
  loser_country: string | null;
  sets: { p1: number; p2: number }[];
  winner_side: number;
  quality: number;
  overall_rank: number;
};

export default async function GreatestPage({ searchParams }: PageProps<"/lab/greatest">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data } = await createPublicClient().from("stat_cache").select("data").eq("key", `great:${tour}`).maybeSingle();
  const all = (data?.data ?? []) as unknown as Great[];
  const seasons = [...new Set(all.map((g) => g.season))].sort((a, b) => b - a);
  const season = typeof q.season === "string" && /^\d{4}$/.test(q.season) && seasons.includes(Number(q.season)) ? Number(q.season) : null;
  const rows = season ? all.filter((g) => g.season === season).slice(0, 10) : all.filter((g) => g.overall_rank <= 50);
  const link = (t: Tour, s: number | null) => `/lab/greatest?tour=${t}${s ? `&season=${s}` : ""}`;
  const score = (g: Great) =>
    g.sets
      .filter((s) => s.p1 !== null && s.p2 !== null)
      .map((s) => (g.winner_side === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
      .join(" ");

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">The greatest matches since 2015</h1>
        <p className="text-sm text-muted">
          Every tracked match scored for quality: how strong both players were going into the event, how close it was (a deciding set,
          tiebreaks, few games between them) and what was at stake (the round, the event).
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <nav aria-label="Tour" className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={link(t, season)} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Season" className="flex flex-wrap gap-1.5">
          <Link href={link(tour, null)} aria-current={season === null ? "page" : undefined} className={`rounded-lg border px-2.5 py-1 ${season === null ? "border-accent bg-accent-soft font-medium" : "border-border hover:bg-surface-muted"}`}>
            All seasons
          </Link>
          {seasons.map((s) => (
            <Link key={s} href={link(tour, s)} aria-current={s === season ? "page" : undefined} className={`rounded-lg border px-2.5 py-1 tabular-nums ${s === season ? "border-accent bg-accent-soft font-medium" : "border-border hover:bg-surface-muted"}`}>
              {s}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed daily; check back soon.</p>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {rows.map((g, i) => (
            <li key={g.match_id} className="flex items-start gap-3 px-4 py-3">
              <span className="w-6 shrink-0 pt-0.5 text-right text-xs text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <Flag code={g.winner_country} reserve />
                  <Link href={`/players/${g.winner_id}`} className="font-medium hover:underline">
                    {g.winner}
                  </Link>
                  <span className="text-muted">d.</span>
                  <Flag code={g.loser_country} reserve />
                  <Link href={`/players/${g.loser_id}`} className="hover:underline">
                    {g.loser}
                  </Link>
                </span>
                <Link href={`/matches/${g.match_id}`} className="mt-1.5 block text-xs text-muted hover:underline">
                  {displayName(g.tournament)} {g.season}
                  {g.round ? ` · ${g.round}` : ""} · <span className="font-mono">{score(g)}</span>
                </Link>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{g.quality.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">
        Quality = average rating going in (above 1700, per 100 points) + 1.5 for a deciding set + 0.5 per tiebreak + up to 1.2 for a
        small games margin + 2 for a final (1.2 semifinal, 0.7 quarterfinal) + 1 at a Grand Slam (0.5 at a 1000). Retirements left out.
        It measures what the results show, not how the match felt; recomputed daily.
      </p>
    </div>
  );
}
