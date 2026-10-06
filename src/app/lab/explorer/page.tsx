import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ExplorerPicker } from "@/components/explorer-picker";
import { Flag } from "@/components/flag";
import { getPlayerLines } from "@/lib/data/explorer";
import { getPlayer } from "@/lib/data/tennis";
import { applyFilters, parseFilters, splits, winsAboveExpected, type Line, type Split } from "@/lib/lab/explorer";

export const metadata: Metadata = {
  title: "Results explorer",
  description: "Query any player's tracked matches since 2015 by opponent, surface, season, round, category, result, favourite or underdog, deciding sets and tiebreaks. Splits and CSV export.",
};

const pct = (w: number, l: number) => (w + l ? `${Math.round((100 * w) / (w + l))}%` : "–");
const STAGE_NAME = ["", "First round", "Second round", "Third round", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
const select = "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";

function SplitTable({ title, rows }: { title: string; rows: Split[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border first:border-0">
              <th scope="row" className="py-1 text-left font-normal">{r.key}</th>
              <td className="py-1 text-right">
                {r.w}–{r.l}
              </td>
              <td className="w-14 py-1 text-right font-semibold">{pct(r.w, r.l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function ExplorerPage({ searchParams }: PageProps<"/lab/explorer">) {
  const q = await searchParams;
  const pid = typeof q.p === "string" && /^\d{1,9}$/.test(q.p) ? Number(q.p) : null;
  const player = pid ? await getPlayer(pid) : null;
  const filters = parseFilters(q);
  const all = player ? await getPlayerLines(player.id) : [];
  const lines = applyFilters(all, filters);
  const opponent = filters.opponent ? all.find((l) => l.opponent.id === filters.opponent)?.opponent : null;
  const seasons = [...new Set(all.map((l) => l.season).filter((s): s is number => s !== null))].sort((a, b) => b - a);
  const w = lines.filter((l) => l.won).length;
  const exp = winsAboveExpected(lines);
  const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string")).toString();

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Results explorer</h1>
        <p className="text-sm text-muted">
          Every tracked match of a player since 2015, filtered any way you like. Each query has its own address to share, and the results
          download as CSV.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Suspense>
          <ExplorerPicker param="p" label={player ? `Player: ${player.fullName} (change)` : "Player"} />
        </Suspense>
        {player && (
          <Suspense>
            <ExplorerPicker param="o" label={opponent ? `Opponent: ${opponent.name} (change)` : "Only against… (optional)"} />
          </Suspense>
        )}
      </div>

      {player && (
        <form method="get" action="/lab/explorer" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
          <input type="hidden" name="p" value={player.id} />
          {filters.opponent && <input type="hidden" name="o" value={filters.opponent} />}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Surface</span>
            <select name="surface" defaultValue={filters.surface ?? ""} className={select}>
              <option value="">Any</option>
              <option>Hard</option>
              <option>Clay</option>
              <option>Grass</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">From</span>
            <select name="from" defaultValue={filters.from ?? ""} className={select}>
              <option value="">Any</option>
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">To</span>
            <select name="to" defaultValue={filters.to ?? ""} className={select}>
              <option value="">Any</option>
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Round</span>
            <select name="stage" defaultValue={filters.stage ?? ""} className={select}>
              <option value="">Any</option>
              <option value="early">Before QF</option>
              <option value="qf">Quarterfinal</option>
              <option value="sf">Semifinal</option>
              <option value="f">Final</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Event</span>
            <select name="cat" defaultValue={filters.category ?? ""} className={select}>
              <option value="">Any</option>
              <option value="slam">Grand Slam</option>
              <option value="1000">1000</option>
              <option value="500">500</option>
              <option value="250">250</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Result</span>
            <select name="result" defaultValue={filters.result ?? ""} className={select}>
              <option value="">Any</option>
              <option value="w">Won</option>
              <option value="l">Lost</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Going in</span>
            <select name="role" defaultValue={filters.role ?? ""} className={select}>
              <option value="">Any</option>
              <option value="favourite">As favourite</option>
              <option value="underdog">As underdog</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 py-1.5">
            <input type="checkbox" name="deciding" value="1" defaultChecked={filters.deciding} /> Deciding set
          </label>
          <label className="flex items-center gap-1.5 py-1.5">
            <input type="checkbox" name="tb" value="1" defaultChecked={filters.tiebreak} /> Had a tiebreak
          </label>
          <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background">
            Apply
          </button>
          <Link href={`/lab/explorer?p=${player.id}`} className="px-2 py-1.5 text-muted hover:text-foreground hover:underline">
            Reset
          </Link>
        </form>
      )}

      {player && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-3">
              <dt className="text-xs text-muted">Record</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {w}–{lines.length - w}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <dt className="text-xs text-muted">Win rate</dt>
              <dd className="text-xl font-semibold tabular-nums">{pct(w, lines.length - w)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <dt className="text-xs text-muted">Model expected</dt>
              <dd className="text-xl font-semibold tabular-nums">{exp.n ? `${exp.expected.toFixed(1)} wins` : "–"}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <dt className="text-xs text-muted">Above expectation</dt>
              <dd className={`text-xl font-semibold tabular-nums ${exp.actual - exp.expected >= 0 ? "text-up" : "text-down"}`}>
                {exp.n ? `${exp.actual - exp.expected >= 0 ? "+" : "−"}${Math.abs(exp.actual - exp.expected).toFixed(1)}` : "–"}
              </dd>
            </div>
          </dl>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SplitTable title="By surface" rows={splits(lines, (l) => l.surface)} />
            <SplitTable title="By round" rows={splits([...lines].sort((a, b) => b.roundRank - a.roundRank), (l) => STAGE_NAME[l.roundRank])} />
            <SplitTable title="By season" rows={splits(lines, (l) => (l.season ? String(l.season) : null))} />
            <SplitTable
              title="Going in"
              rows={splits(lines, (l) => (l.chance === null ? null : l.chance >= 0.65 ? "Clear favourite" : l.chance >= 0.5 ? "Slight favourite" : l.chance >= 0.35 ? "Slight underdog" : "Clear underdog"))}
            />
          </div>

          <section aria-labelledby="m-heading" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="m-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Matches · {lines.length}
              </h2>
              <a href={`/lab/explorer/csv?${qs}`} className="text-sm font-medium text-accent hover:underline">
                Download CSV
              </a>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Matching matches, newest first</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Event</th>
                    <th scope="col" className="px-2 py-2 font-medium">Opponent</th>
                    <th scope="col" className="px-2 py-2 font-medium">Result</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Chance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.slice(0, 300).map((l: Line) => (
                    <tr key={l.matchId}>
                      <td className="max-w-[12rem] px-3 py-2">
                        <Link href={`/tournaments/${l.tournamentId}`} className="block truncate hover:underline">
                          {l.tournament} {l.season}
                        </Link>
                        <span className="block text-xs text-muted">{l.round}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Flag code={l.opponent.country} reserve />
                          {l.opponent.id !== null ? (
                            <Link href={`/players/${l.opponent.id}`} className="hover:underline">
                              {l.opponent.name}
                            </Link>
                          ) : (
                            l.opponent.name
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <Link href={`/matches/${l.matchId}`} className="hover:underline">
                          <span className={l.won ? "font-semibold text-up" : "text-down"}>{l.won ? "W" : "L"}</span>{" "}
                          <span className="font-mono text-xs">{l.sets.map(([a, b]) => `${a}-${b}`).join(" ")}</span>
                          {l.retired ? " ret." : ""}
                        </Link>
                      </td>
                      <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{l.chance === null ? "–" : `${Math.round(l.chance * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lines.length > 300 && <p className="text-xs text-muted">Showing the latest 300; the CSV has all {lines.length}.</p>}
          </section>
        </>
      )}
      {!player && <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Pick a player to start.</p>}
    </div>
  );
}
