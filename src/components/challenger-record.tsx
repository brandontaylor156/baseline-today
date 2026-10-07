import type { ChallengerResult, ChallengerSeason } from "@/lib/data/challengers";
import { pageUrl } from "@/lib/wiki/client";

/** A player's ATP Challenger record by season and their latest Challenger results, with sources. */
export function ChallengerRecord({ seasons, recent }: { seasons: ChallengerSeason[]; recent: ChallengerResult[] }) {
  const sources = [...new Set(recent.map((r) => r.drawTitle))].slice(0, 6);
  return (
    <section aria-labelledby="challenger-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="challenger-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        ATP Challenger Tour
      </h2>
      <ul className="flex flex-wrap gap-2 text-sm tabular-nums" aria-label="Challenger record by season">
        {seasons.map((s) => (
          <li key={s.season} className="rounded-lg border border-border px-2.5 py-1">
            <span className="text-muted">{s.season}</span> {s.wins}–{s.losses}
            {s.titles > 0 && <span className="text-accent"> · {s.titles === 1 ? "1 title" : `${s.titles} titles`}</span>}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Latest ATP Challenger results</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pr-2 font-medium">Event</th>
              <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Round</th>
              <th scope="col" className="px-2 py-2 font-medium">Opponent</th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recent.map((r, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  {r.event} <span className="text-xs text-muted">{r.season}</span>
                </td>
                <td className="hidden px-2 py-2 text-muted sm:table-cell">{r.round}</td>
                <td className="px-2 py-2">
                  <span className={`mr-1.5 text-xs font-semibold ${r.won ? "text-up" : "text-down"}`}>{r.won ? "W" : "L"}</span>
                  {r.opponent}
                </td>
                <td className="whitespace-nowrap py-2 pl-2 text-right text-muted">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        From the Wikipedia draw pages (CC BY-SA 4.0):{" "}
        {sources.map((t, i) => (
          <span key={t}>
            {i > 0 && " · "}
            <a href={pageUrl(t)} className="underline hover:text-foreground">
              {t}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
