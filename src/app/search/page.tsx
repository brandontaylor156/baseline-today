import type { Metadata } from "next";
import Link from "next/link";

import { searchPlayers } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Search" };

// Full results page: the target of the search form when JavaScript is off or Enter is pressed.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").slice(0, 80);
  const results = await searchPlayers(query, 25);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {query ? <>Results for “{query}”</> : "Search players"}
      </h1>
      {query.trim().length < 2 ? (
        <p className="text-muted">Type at least two letters of a player’s name.</p>
      ) : results.length === 0 ? (
        <p className="text-muted">No players match. Only players in the ATP and WTA top 100 are tracked.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/players/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted">
                <span className="font-medium">{r.fullName}</span>
                <span className="text-sm text-muted tabular-nums">
                  {TOUR_LABEL[r.tour]}
                  {r.currentRank ? ` #${r.currentRank}` : ""}
                  {r.countryCode ? ` · ${r.countryCode}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
