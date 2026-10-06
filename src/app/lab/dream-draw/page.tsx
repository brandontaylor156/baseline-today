import type { Metadata } from "next";
import Link from "next/link";

import { DreamDraw, type Seed } from "@/components/dream-draw";
import { getPeaks } from "@/lib/data/lab";
import { getModelInfo } from "@/lib/data/predictions";
import { getRatedPlayers } from "@/lib/data/ratings";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dream draw simulator",
  description: "Put any 8 or 16 players, today or at their peak, into a seeded draw and see each one's exact chance to reach every round, on any surface.",
};

export default async function DreamDrawPage() {
  const [info, atpNow, wtaNow, atpPeak, wtaPeak] = await Promise.all([getModelInfo(), getRatedPlayers("atp"), getRatedPlayers("wta"), getPeaks("atp"), getPeaks("wta")]);
  const now = (rows: typeof atpNow): Seed[] =>
    rows
      .filter((r) => r.id !== null && r.rank !== null)
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 16)
      .map((r) => ({ id: r.id!, name: r.name }));
  const peaks = (rows: typeof atpPeak): Seed[] => rows.slice(0, 16).map((r) => ({ id: r.id, name: r.name }));
  const presets = {
    "ATP today": { tour: "atp" as const, when: "now" as const, players: now(atpNow) },
    "ATP peaks": { tour: "atp" as const, when: "peak" as const, players: peaks(atpPeak) },
    "WTA today": { tour: "wta" as const, when: "now" as const, players: now(wtaNow) },
    "WTA peaks": { tour: "wta" as const, when: "peak" as const, players: peaks(wtaPeak) },
  };
  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Dream draw</h1>
        <p className="text-sm text-muted">
          Build a draw from today’s best, or from every player at their peak since 2015. It’s seeded by rating, and each player’s chance
          to reach every round is computed exactly through the bracket, on the surface and format you pick.
        </p>
      </div>
      <DreamDraw presets={presets} calibration={info.calibration} />
      <p className="text-xs text-muted">
        Ratings are relative to each player’s own era, so a peaks draw compares how dominant each player was at their best, not who would
        win on the same day. Same calibrated, surface-aware model as the rest of the site.
      </p>
    </div>
  );
}
