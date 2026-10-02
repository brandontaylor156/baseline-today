// Exact title chances for a single-elimination draw (pure, unit tested). No simulation: round by
// round, each player's chance to survive is their chance to be alive times their chance to beat
// whoever comes out of the neighbouring block. Played results fix the outcome.

export interface DrawEntry {
  key: string;
  position: number;
}

export interface PlayedResult {
  winner: string;
  loser: string;
}

/** The round (1 = first) in which players at these two places meet. */
export const meetingRound = (a: number, b: number) => Math.floor(Math.log2(a ^ b)) + 1;

/**
 * For each player, the chance of winning at least r matches, for r = 0…rounds (the last entry
 * is the title). `pWin(a, b)` is the chance that a beats b.
 */
export function titleOdds(size: number, entries: DrawEntry[], played: PlayedResult[], pWin: (a: string, b: string) => number): Map<string, number[]> {
  const rounds = Math.round(Math.log2(size));
  const posOf = new Map(entries.map((e) => [e.key, e.position]));
  const at: (string | null)[] = Array.from({ length: size }, () => null);
  for (const e of entries) if (e.position >= 0 && e.position < size) at[e.position] = e.key;

  // From the results: the furthest round each player is known to have reached (won the round
  // before), and who lost in which round.
  const knownWins = new Map<string, number>();
  const lostIn = new Map<string, number>();
  for (const m of played) {
    const a = posOf.get(m.winner);
    const b = posOf.get(m.loser);
    if (a === undefined || b === undefined || a === b) continue;
    const r = meetingRound(a, b);
    knownWins.set(m.winner, Math.max(knownWins.get(m.winner) ?? 0, r));
    // Reaching round r means winning every earlier round too.
    knownWins.set(m.loser, Math.max(knownWins.get(m.loser) ?? 0, r - 1));
    lostIn.set(m.loser, r);
  }

  const reach = new Map<string, number[]>();
  for (const e of entries) reach.set(e.key, [1]);
  let alive = new Map(entries.map((e) => [e.key, 1]));

  for (let r = 1; r <= rounds; r++) {
    const next = new Map<string, number>();
    const block = 2 ** r;
    const half = block / 2;
    for (let start = 0; start < size; start += block) {
      const sideA = at.slice(start, start + half).filter((k): k is string => k !== null);
      const sideB = at.slice(start + half, start + block).filter((k): k is string => k !== null);
      const members = [...sideA, ...sideB];
      // Someone here is known to have won this round: they go through, everyone else is out.
      const through = members.find((k) => (knownWins.get(k) ?? 0) >= r);
      for (const k of members) {
        let p: number;
        if (through !== undefined) p = k === through ? 1 : 0;
        else if ((lostIn.get(k) ?? Infinity) <= r) p = 0;
        else {
          const opponents = sideA.includes(k) ? sideB : sideA;
          const total = opponents.reduce((s, j) => s + (alive.get(j) ?? 0), 0);
          const own = alive.get(k) ?? 0;
          p = total === 0 ? own : (own * opponents.reduce((s, j) => s + (alive.get(j) ?? 0) * pWin(k, j), 0)) / total;
        }
        next.set(k, p);
        reach.get(k)!.push(p);
      }
    }
    alive = next;
  }
  return reach;
}
