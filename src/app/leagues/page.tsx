import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LeaguesClient, type PublicLeague, type SampleRow } from "@/components/leagues-client";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Private leagues",
  description: "Play Pick'em and the Bracket Challenge against friends in a private league.",
  robots: { index: false },
};

export const revalidate = 300;

export default async function LeaguesPage() {
  const season = new Date().getUTCFullYear();
  const seasonStart = `${season}-01-01`;
  const db = createPublicClient();
  const [{ data: sample }, { data: directory }] = await Promise.all([db.rpc("sample_league_standings", { p_season: season }), db.rpc("public_leagues")]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/pickem" className="text-sm text-muted hover:text-foreground">
          ← Pick’em
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Private leagues</h1>
        <p className="text-sm text-muted">
          Play against friends: your league ranks members by correct Pick’em picks this season plus Bracket Challenge points (10
          bracket points count as one pick).
        </p>
      </div>
      <Suspense>
        <LeaguesClient seasonStart={seasonStart} sample={(sample ?? []) as SampleRow[]} directory={(directory ?? []) as PublicLeague[]} />
      </Suspense>
    </div>
  );
}
