// The win network (pure, unit tested). Every result is an edge from loser to winner; PageRank on
// that graph rewards beating players who themselves beat good players (Radicchi, PLoS ONE 2011).
// And chains of real wins between any two players: A beat X, who beat Y, who beat B.

export interface Win {
  winner: string;
  loser: string;
  /** For chains: the match to link to. */
  matchId?: number;
}

/** PageRank with each loss passing credit to the winner; dangling players spread evenly. */
export function pageRank(wins: Win[], damping = 0.85, iterations = 60): Map<string, number> {
  const nodes = [...new Set(wins.flatMap((w) => [w.winner, w.loser]))];
  const index = new Map(nodes.map((n, i) => [n, i]));
  const out = new Array<number>(nodes.length).fill(0);
  for (const w of wins) out[index.get(w.loser)!]++;
  let rank = new Array<number>(nodes.length).fill(1 / nodes.length);
  for (let it = 0; it < iterations; it++) {
    const next = new Array<number>(nodes.length).fill((1 - damping) / nodes.length);
    let dangling = 0;
    nodes.forEach((_, i) => {
      if (out[i] === 0) dangling += rank[i];
    });
    for (let i = 0; i < nodes.length; i++) next[i] += (damping * dangling) / nodes.length;
    for (const w of wins) {
      const l = index.get(w.loser)!;
      next[index.get(w.winner)!] += (damping * rank[l]) / out[l];
    }
    rank = next;
  }
  return new Map(nodes.map((n, i) => [n, rank[i]]));
}

/**
 * The shortest chain of wins from `from` to `to` (each step: the earlier player beat the next), or
 * null within `maxSteps`. Breadth-first over "beat" edges.
 */
export function winChain(wins: Win[], from: string, to: string, maxSteps = 6): Win[] | null {
  if (from === to) return [];
  const beat = new Map<string, Win[]>();
  for (const w of wins) {
    const list = beat.get(w.winner) ?? [];
    list.push(w);
    beat.set(w.winner, list);
  }
  const via = new Map<string, Win>();
  let frontier = [from];
  const seen = new Set([from]);
  for (let step = 0; step < maxSteps && frontier.length; step++) {
    const next: string[] = [];
    for (const p of frontier) {
      for (const w of beat.get(p) ?? []) {
        if (seen.has(w.loser)) continue;
        seen.add(w.loser);
        via.set(w.loser, w);
        if (w.loser === to) {
          const chain: Win[] = [];
          let cur = to;
          while (cur !== from) {
            const e = via.get(cur)!;
            chain.unshift(e);
            cur = e.winner;
          }
          return chain;
        }
        next.push(w.loser);
      }
    }
    frontier = next;
  }
  return null;
}
