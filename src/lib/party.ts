// Watch-party logic (pure, unit tested): which call is open, the room's call leaderboard, and the
// win-chance line through the match.
import { liveChance, serveModelFor, type ServeModel } from "@/lib/live-prob";
import { replay, type ScoreSnapshot } from "@/lib/scorekeeper";

export const SERVE_AVERAGE = { atp: 0.63, wta: 0.56 } as const;

export interface Call {
  user_id: string;
  call_key: string;
  side: number;
}

/**
 * The call members can make now: the match winner until the first set ends, and each set's winner
 * until its first game is over. Null once the match is decided.
 */
export function openCalls(s: ScoreSnapshot): string[] {
  if (s.winner) return [];
  const setNumber = s.sets.length;
  const current = s.sets[setNumber - 1];
  const open: string[] = [];
  if (s.setsA + s.setsB === 0) open.push("match");
  if (current.a + current.b === 0) open.push(`set-${setNumber}`);
  return open;
}

/** Who won each decided call key ("set-1", "match"). */
export function decided(s: ScoreSnapshot): Map<string, 1 | 2> {
  const out = new Map<string, 1 | 2>();
  s.sets.forEach((set, i) => {
    const done = (Math.max(set.a, set.b) >= 6 && Math.abs(set.a - set.b) >= 2) || Math.max(set.a, set.b) === 7;
    if (done) out.set(`set-${i + 1}`, set.a > set.b ? 1 : 2);
  });
  if (s.winner) out.set("match", s.winner);
  return out;
}

export function callTable(calls: Call[], s: ScoreSnapshot): Map<string, { right: number; settled: number }> {
  const results = decided(s);
  const out = new Map<string, { right: number; settled: number }>();
  for (const c of calls) {
    const winner = results.get(c.call_key);
    if (!winner) continue;
    const row = out.get(c.user_id) ?? { right: 0, settled: 0 };
    row.settled++;
    if (c.side === winner) row.right++;
    out.set(c.user_id, row);
  }
  return out;
}

/** A's win chance before the first point and after every point. */
export function momentum(points: (1 | 2)[], model: ServeModel, firstServerA: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i <= points.length; i++) {
    const snap = replay(points.slice(0, i), model.bestOf, firstServerA);
    out.push(snap.winner ? (snap.winner === 1 ? 1 : 0) : liveChance(model, snap.state));
  }
  return out;
}

export function roomModel(preMatchA: number | null, bestOf: 3 | 5, tour: "atp" | "wta"): ServeModel {
  return serveModelFor(preMatchA ?? 0.5, bestOf, SERVE_AVERAGE[tour]);
}
