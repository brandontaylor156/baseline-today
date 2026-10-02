import Link from "next/link";

import { Flag } from "@/components/flag";
import type { TitleChance, TitleOdds } from "@/lib/draw-model";

const SHOWN = 8;

function pct(p: number): string {
  if (p >= 0.995) return "99%+";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

function Row({ p, rounds, previous }: { p: TitleChance; rounds: number; previous?: Map<string, number> }) {
  const before = previous?.get(p.key);
  const change = before === undefined ? 0 : Math.round((p.title - before) * 100);
  return (
    <tr>
      <td className="max-w-0 py-2 pl-4 pr-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Flag code={p.countryCode} reserve />
          {p.id !== null ? (
            <Link href={`/players/${p.id}`} className="truncate hover:underline">
              {p.name}
            </Link>
          ) : (
            <span className="truncate">{p.name}</span>
          )}
          {p.seed && /^\d+$/.test(p.seed) && <span className="shrink-0 text-xs text-muted">({p.seed})</span>}
        </span>
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums text-muted sm:table-cell">{rounds >= 3 ? pct(p.reach[rounds - 2] ?? 0) : ""}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted">{pct(p.reach[rounds - 1] ?? 0)}</td>
      <td className="py-2 pl-2 pr-4">
        <span className="flex items-center justify-end gap-2">
          <span aria-hidden className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted sm:flex">
            <span className="bg-chart-line" style={{ width: `${p.title * 100}%` }} />
          </span>
          {change !== 0 && (
            <span className={`text-xs tabular-nums ${change > 0 ? "text-accent" : "text-muted"}`}>
              {change > 0 ? "+" : "−"}
              {Math.abs(change)}
            </span>
          )}
          <span className="w-10 text-right font-semibold tabular-nums">{pct(p.title)}</span>
        </span>
      </td>
    </tr>
  );
}

function Table({ players, rounds, caption, previous }: { players: TitleChance[]; rounds: number; caption: string; previous?: Map<string, number> }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="border-b border-border text-left text-xs text-muted">
        <tr>
          <th scope="col" className="w-full py-2 pl-4 pr-2 font-medium">
            Player
          </th>
          <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-medium sm:table-cell">
            {rounds >= 3 ? "Semis" : ""}
          </th>
          <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
            Final
          </th>
          <th scope="col" className="whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium">
            Title
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {players.map((p) => (
          <Row key={p.key} p={p} rounds={rounds} previous={previous} />
        ))}
      </tbody>
    </table>
  );
}

/** Each remaining player's chance to reach the semis, the final and win the title. */
export function TitleChances({ odds, previous }: { odds: TitleOdds; previous?: Map<string, number> }) {
  const top = odds.players.slice(0, SHOWN);
  const rest = odds.players.slice(SHOWN);
  return (
    <section aria-labelledby="title-heading" className="space-y-2">
      <h2 id="title-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Title chances{previous ? " · with your picks" : ""}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Table players={top} rounds={odds.rounds} previous={previous} caption="Chance to reach the semifinals, the final, and to win the title" />
        {rest.length > 0 && (
          <details className="border-t border-border">
            <summary className="cursor-pointer px-4 py-2 text-sm text-muted hover:text-foreground">
              All {odds.players.length} players still in the draw
            </summary>
            <Table players={rest} rounds={odds.rounds} previous={previous} caption="Other players still in the draw" />
          </details>
        )}
      </div>
      <p className="text-xs text-muted">
        Worked out from the draw, the results so far and our model’s chance for every possible match. Estimates, not betting
        advice.
      </p>
    </section>
  );
}
