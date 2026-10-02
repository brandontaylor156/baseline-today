import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LeaguesClient } from "@/components/leagues-client";

export const metadata: Metadata = {
  title: "Private leagues",
  description: "Play Pick'em and the Bracket Challenge against friends in a private league.",
  robots: { index: false },
};

export default function LeaguesPage() {
  const seasonStart = `${new Date().getUTCFullYear()}-01-01`;
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
        <LeaguesClient seasonStart={seasonStart} />
      </Suspense>
    </div>
  );
}
