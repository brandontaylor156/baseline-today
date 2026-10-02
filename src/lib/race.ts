// The season points race (pure, unit tested): points banked from tracked results, plus a
// projection for tournaments in progress from each player's chances to go further.
import type { SeasonMatch } from "@/lib/leaders";
import { expectedPoints, pointsFor } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";

export interface RaceEvent {
  tour: Tour;
  category: string | null;
  /** Rounds in the draw (log2 of the bracket size). */
  rounds: number;
}

export interface LiveDraw {
  reach: Map<string, number[]>;
  players: { key: string; id: number | null; name: string; countryCode: string | null }[];
}

export interface RaceRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  /** Earned so far (in events in progress: the minimum already guaranteed). */
  points: number;
  /** Points plus the expected extra from events in progress. */
  projected: number;
  events: number;
}

export const roundsFor = (drawSize: number | null) => (drawSize && drawSize > 1 ? Math.ceil(Math.log2(drawSize)) : 0);

/** Round number (1 = first) from a label, given the number of rounds. */
export function roundNumber(label: string | null, rounds: number): number {
  const l = (label ?? "").toLowerCase();
  if (/^finals?$/.test(l)) return rounds;
  if (l.includes("semi")) return rounds - 1;
  if (l.includes("quarter")) return rounds - 2;
  const n = ["first", "second", "third", "fourth"].findIndex((w) => l.startsWith(w));
  return n >= 0 ? n + 1 : 0;
}

export function raceTable(matches: SeasonMatch[], events: Map<number, RaceEvent>, live: Map<number, LiveDraw>): RaceRow[] {
  type Run = { first: number; last: number; wonLast: boolean };
  const runs = new Map<string, Map<number, Run>>();
  const info = new Map<string, { id: number | null; name: string; country: string | null }>();

  for (const m of matches) {
    const ev = events.get(m.tournamentId);
    if (!ev) continue;
    const n = roundNumber(m.round, ev.rounds);
    if (n === 0) continue;
    for (const [side, p] of [[1, m.p1], [2, m.p2]] as const) {
      info.set(p.key, { id: p.id, name: p.name, country: p.country });
      const byEvent = runs.get(p.key) ?? new Map<number, Run>();
      const run = byEvent.get(m.tournamentId);
      const won = m.winner === side;
      if (!run) byEvent.set(m.tournamentId, { first: n, last: n, wonLast: won });
      else {
        if (n < run.first) run.first = n;
        if (n >= run.last) Object.assign(run, { last: n, wonLast: won });
      }
      runs.set(p.key, byEvent);
    }
  }
  // Players in live draws who haven't played yet.
  for (const [tid, draw] of live) {
    for (const p of draw.players) {
      if (!info.has(p.key)) info.set(p.key, { id: p.id, name: p.name, country: p.countryCode });
      const byEvent = runs.get(p.key) ?? new Map<number, Run>();
      if (!byEvent.has(tid) && events.has(tid)) byEvent.set(tid, { first: 0, last: 0, wonLast: true });
      runs.set(p.key, byEvent);
    }
  }

  const rows: RaceRow[] = [];
  for (const [key, byEvent] of runs) {
    let points = 0;
    let projected = 0;
    for (const [tid, run] of byEvent) {
      const ev = events.get(tid)!;
      // Wins: rounds before the last one played, plus the last if won (robust to gaps and byes).
      const wins = run.last === 0 ? 0 : run.last - 1 + (run.wonLast ? 1 : 0);
      const hadBye = run.first === 2;
      const reach = live.get(tid)?.reach.get(key);
      const alive = reach !== undefined && (reach.at(-1) ?? 0) > 0 && run.wonLast;
      const banked = pointsFor(ev.tour, ev.category, ev.rounds, wins, hadBye);
      points += banked;
      projected += alive ? Math.max(banked, expectedPoints(ev.tour, ev.category, ev.rounds, reach, hadBye)) : banked;
    }
    const who = info.get(key)!;
    rows.push({ key, id: who.id, name: who.name, country: who.country, points, projected: Math.round(projected), events: byEvent.size });
  }
  return rows.sort((a, b) => b.points - a.points || b.projected - a.projected || a.name.localeCompare(b.name));
}
