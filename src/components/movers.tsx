import Link from "next/link";

import type { RankingRow } from "@/lib/data/tennis";

import { Flag } from "./flag";

function MoverList({ title, items, sign }: { title: string; items: RankingRow[]; sign: "up" | "down" }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None this week</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((r) => (
            <li key={r.player.id} className="flex items-center gap-2">
              <span className={`w-10 shrink-0 text-xs font-semibold tabular-nums ${sign === "up" ? "text-up" : "text-down"}`}>
                {sign === "up" ? "▲" : "▼"}
                {Math.abs(r.movement ?? 0)}
                <span className="sr-only">{sign === "up" ? " places up" : " places down"}</span>
              </span>
              <Flag code={r.player.countryCode} reserve />
              <Link href={`/players/${r.player.id}`} className="min-w-0 truncate hover:underline">
                {r.player.fullName}
              </Link>
              <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">#{r.rank}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Top climbers and fallers in a ranking snapshot (by the provider's weekly movement). */
export function Movers({ rows }: { rows: RankingRow[] }) {
  const up = rows.filter((r) => (r.movement ?? 0) > 0).sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0)).slice(0, 3);
  const down = rows.filter((r) => (r.movement ?? 0) < 0).sort((a, b) => (a.movement ?? 0) - (b.movement ?? 0)).slice(0, 3);
  if (up.length === 0 && down.length === 0) return null;
  return (
    <section aria-label="Biggest movers" className="mb-5 flex flex-col gap-3 sm:flex-row">
      <MoverList title="Biggest climbers" items={up} sign="up" />
      <MoverList title="Biggest fallers" items={down} sign="down" />
    </section>
  );
}
