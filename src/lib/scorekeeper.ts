// Tennis scoring from a sequence of points (pure, unit tested). Powers watch-party scorekeeping:
// the host taps who won each point; everyone gets the score and the live win chance.
import type { LiveState } from "@/lib/live-prob";

export interface ScoreSnapshot {
  /** Completed and current sets as games, player A first. */
  sets: { a: number; b: number }[];
  /** Points in the current game ("0", "15", "30", "40", "AD") or tiebreak numbers. */
  gameA: string;
  gameB: string;
  serverA: boolean;
  tiebreak: boolean;
  setsA: number;
  setsB: number;
  /** 1 or 2 once the match is over. */
  winner: 1 | 2 | null;
  /** The live-model state for win chances. */
  state: LiveState;
}

const LABEL = ["0", "15", "30", "40"];

/**
 * Replays points (1 = A won it, 2 = B won it). `firstServerA`: who served the first game. Sets
 * go to a tiebreak at 6-6 (first to 7 by 2), including the final set.
 */
export function replay(points: (1 | 2)[], bestOf: 3 | 5, firstServerA: boolean): ScoreSnapshot {
  const need = Math.ceil(bestOf / 2);
  const sets: { a: number; b: number }[] = [{ a: 0, b: 0 }];
  let setsA = 0;
  let setsB = 0;
  let pa = 0;
  let pb = 0;
  let serverA = firstServerA;
  let tiebreakFirstA = firstServerA;
  let winner: 1 | 2 | null = null;

  const current = () => sets[sets.length - 1];
  const inTiebreak = () => current().a === 6 && current().b === 6;

  for (const p of points) {
    if (winner) break;
    if (p === 1) pa++;
    else pb++;
    const tb = inTiebreak();
    const target = tb ? 7 : 4;
    if ((pa >= target || pb >= target) && Math.abs(pa - pb) >= 2) {
      const aWon = pa > pb;
      if (aWon) current().a++;
      else current().b++;
      pa = 0;
      pb = 0;
      const { a, b } = current();
      const setOver = tb || (Math.max(a, b) >= 6 && Math.abs(a - b) >= 2);
      // After a tiebreak, the player who received first in it serves the next set's first game.
      serverA = tb ? !tiebreakFirstA : !serverA;
      if (setOver) {
        if (a > b) setsA++;
        else setsB++;
        if (setsA === need) winner = 1;
        else if (setsB === need) winner = 2;
        else sets.push({ a: 0, b: 0 });
      }
      if (inTiebreak()) tiebreakFirstA = serverA;
    } else if (tb) {
      // Tiebreak serve: first point by one player, then two each, alternating.
      const k = pa + pb;
      serverA = Math.floor((k - 1) / 2) % 2 === 0 ? !tiebreakFirstA : tiebreakFirstA;
    }
  }

  const tb = inTiebreak() && !winner;
  const label = (mine: number, theirs: number) => {
    if (tb) return String(mine);
    if (mine >= 3 && theirs >= 3) return mine > theirs ? "AD" : "40";
    return LABEL[Math.min(mine, 3)];
  };
  return {
    sets: sets.map((s) => ({ ...s })),
    gameA: label(pa, pb),
    gameB: label(pb, pa),
    serverA,
    tiebreak: tb,
    setsA,
    setsB,
    winner,
    state: {
      setsA,
      setsB,
      gamesA: current().a,
      gamesB: current().b,
      // Advantage is deuce plus one for the live model.
      pointsA: tb ? pa : pa >= 3 && pb >= 3 ? 3 + (pa > pb ? 1 : 0) : pa,
      pointsB: tb ? pb : pa >= 3 && pb >= 3 ? 3 + (pb > pa ? 1 : 0) : pb,
      serverA,
      tiebreak: tb,
    },
  };
}
