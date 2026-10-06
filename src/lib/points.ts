// Estimated ranking points per round for the season race (pure, unit tested). Our own table of
// the published singles points; small categories and draw sizes vary, so results are estimates.

import type { Tour } from "@/lib/provider/types";

/** Points by exit, from the title backwards: [W, F, SF, QF, R16, R32, R64, R128]. */
type Ladder = number[];

const TABLES: Record<Tour, Record<string, Ladder>> = {
  atp: {
    "Grand Slam": [2000, 1300, 800, 400, 200, 100, 50, 10],
    "Masters 1000": [1000, 650, 400, 200, 100, 50, 30, 10],
    "ATP 500": [500, 330, 200, 100, 50, 0],
    "ATP 250": [250, 165, 100, 50, 25, 0],
  },
  wta: {
    "Grand Slam": [2000, 1300, 780, 430, 240, 130, 70, 10],
    "WTA 1000": [1000, 650, 390, 215, 120, 65, 35, 10],
    "WTA 500": [500, 325, 195, 108, 60, 32, 1],
    "WTA 250": [250, 163, 98, 54, 31, 1],
    "WTA 125": [125, 81, 49, 27, 15, 1],
  },
};

/** Whether a tournament counts for the race (team events and the Finals don't). */
export function countsForRace(tour: Tour, category: string | null): boolean {
  return Boolean(category && TABLES[tour][category]);
}

/**
 * Points for a player's run: `wins` matches won in a draw of `rounds` rounds (champion when
 * wins === rounds). A loss in the first match after a bye earns first-round points.
 */
export function pointsFor(tour: Tour, category: string | null, rounds: number, wins: number, hadBye = false): number {
  const ladder = category ? TABLES[tour][category] : undefined;
  if (!ladder || rounds < 1) return 0;
  if (wins >= rounds) return ladder[0];
  // Lost in round wins + 1; index from the title backwards.
  let exitRound = wins + 1;
  if (hadBye && wins === 1) exitRound = 1;
  const fromEnd = rounds - exitRound + 1;
  return ladder[fromEnd] ?? 0;
}

/** Expected points from here: reach[r] = chance of winning at least r matches. */
export function expectedPoints(tour: Tour, category: string | null, rounds: number, reach: number[], hadBye = false): number {
  let total = 0;
  for (let r = 0; r <= rounds; r++) {
    const exactly = (reach[r] ?? 0) - (r < rounds ? (reach[r + 1] ?? 0) : 0);
    if (exactly > 0) total += exactly * pointsFor(tour, category, rounds, r, hadBye);
  }
  return total;
}

const EXIT = ["title", "final", "semifinal", "quarterfinal", "round of 16", "round of 32", "round of 64", "round of 128"];

/**
 * The smallest single result at each category still to play that is worth at least `gap` points,
 * cheapest first: "what it takes" to close a gap in the race.
 */
export function resultsWorth(tour: Tour, gap: number, categories: string[]): { category: string; result: string; points: number }[] {
  const out: { category: string; result: string; points: number }[] = [];
  for (const category of [...new Set(categories)]) {
    const ladder = TABLES[tour][category];
    if (!ladder) continue;
    // Walk from the earliest exit up to the title; the first step that covers the gap.
    for (let i = ladder.length - 1; i >= 0; i--) {
      if (ladder[i] >= gap && ladder[i] > 0) {
        out.push({ category, result: EXIT[i], points: ladder[i] });
        break;
      }
    }
  }
  return out.sort((a, b) => a.points - b.points);
}

// Draw sizes when the calendar doesn't have one (a typical draw for the category).
const DEFAULT_DRAW: Record<string, number> = {
  "Grand Slam": 128,
  "Masters 1000": 96,
  "WTA 1000": 64,
  "ATP 500": 32,
  "WTA 500": 28,
  "ATP 250": 28,
  "WTA 250": 32,
  "WTA 125": 32,
};

export const defaultDrawSize = (category: string | null) => (category ? DEFAULT_DRAW[category] : undefined) ?? 32;
