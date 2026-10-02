import Link from "next/link";

import { Flag } from "@/components/flag";
import { pathDifficulty } from "@/lib/draw-difficulty";
import { titleChances, type DrawModel } from "@/lib/draw-model";

const CONTENDERS = 8;

/** The favorites' paths at the start of the event, toughest first. */
export function DrawDifficulty({ model }: { model: DrawModel }) {
  const start = titleChances({ ...model, played: [] });
  if (!start) return null;
  const paths = pathDifficulty(model);
  const rows = start.players
    .slice(0, CONTENDERS)
    .map((p) => ({ p, path: paths.get(p.key)! }))
    .sort((a, b) => b.path.average - a.path.average);
  const lo = Math.min(...rows.map((r) => r.path.average));
  const hi = Math.max(...rows.map((r) => r.path.average));

  return (
    <section aria-labelledby="difficulty-heading" className="space-y-2">
      <h2 id="difficulty-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Draw difficulty
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">Average rating of each favorite&apos;s likely opponents, toughest path first</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="w-full py-2 pl-4 pr-2 font-medium">
                Favorite
              </th>
              <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-medium sm:table-cell">
                Title chance at the start
              </th>
              <th scope="col" className="whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium">
                Path rating
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ p, path }, i) => (
              <tr key={p.key}>
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
                    {i === 0 && <span className="shrink-0 text-xs font-medium text-accent">toughest</span>}
                    {i === rows.length - 1 && <span className="shrink-0 text-xs text-muted">easiest</span>}
                  </span>
                </td>
                <td className="hidden px-2 py-2 text-right tabular-nums text-muted sm:table-cell">{Math.round(p.title * 100)}%</td>
                <td className="py-2 pl-2 pr-4">
                  <span className="flex items-center justify-end gap-2">
                    <span aria-hidden className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted sm:flex">
                      <span className="bg-chart-line" style={{ width: `${hi === lo ? 100 : 15 + ((path.average - lo) / (hi - lo)) * 85}%` }} />
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums">{Math.round(path.average)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Path rating: the average model rating of the opponents each favorite would most likely meet, round by round, if they kept
        winning, measured on the draw before any results. Higher means a tougher route.
      </p>
    </section>
  );
}
