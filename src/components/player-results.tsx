import Link from "next/link";

import type { Result } from "@/lib/data/results";

import { Flag } from "./flag";

/** Score from the given player's point of view, e.g. "6-3 4-6 7-6(5)". */
function scoreFor(r: Result, side: 1 | 2): string {
  if (r.resultDetail === "walkover") return "w/o";
  const sets = r.sets
    .filter((s) => s.p1 !== null && s.p2 !== null)
    .map((s) => {
      const mine = side === 1 ? s.p1 : s.p2;
      const theirs = side === 1 ? s.p2 : s.p1;
      const tbs = [s.p1Tiebreak, s.p2Tiebreak].filter((t): t is number => t !== null);
      return `${mine}-${theirs}${tbs.length ? `(${Math.min(...tbs)})` : ""}`;
    })
    .join(" ");
  return `${sets}${r.resultDetail === "retired" ? " ret." : ""}`;
}

export function PlayerResults({ playerId, results }: { playerId: number; results: Result[] }) {
  return (
    <ul className="divide-y divide-border">
      {results.map((r) => {
        const side: 1 | 2 = r.player1?.id === playerId ? 1 : 2;
        const opponent = side === 1 ? r.player2 : r.player1;
        const won = r.winner === side;
        return (
          <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <span
              aria-label={won ? "Won" : "Lost"}
              className={`inline-flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${
                won ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted"
              }`}
            >
              {won ? "W" : "L"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-muted">vs</span>
                <Flag code={opponent?.countryCode ?? null} />
                {opponent?.id != null ? (
                  <Link href={`/players/${opponent.id}`} className="truncate font-medium hover:underline">
                    {opponent.name}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{opponent?.name ?? "Unknown"}</span>
                )}
              </span>
              <span className="block truncate text-xs text-muted">
                {r.tournament.name}
                {r.round ? ` · ${r.round}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums">{scoreFor(r, side)}</span>
          </li>
        );
      })}
    </ul>
  );
}
