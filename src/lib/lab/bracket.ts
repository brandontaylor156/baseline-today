// Draw reconstruction and exact title chances (pure, unit tested).
//
// A finished draw can be rebuilt from its results alone: every match after the first round is
// between the winners of two earlier matches (or a player entering with a bye). Walking the rounds
// in order recovers the whole bracket, which lets us ask what each player's title chance was
// before the first ball, given ratings at the time.

export interface DrawMatch {
  key1: string;
  key2: string;
  winner: 1 | 2;
  /** Larger = later round. */
  round: number;
}

export type Node = { leaf: string } | { left: Node; right: Node; winner: string };

const winnerOf = (m: DrawMatch) => (m.winner === 1 ? m.key1 : m.key2);

/** The bracket tree of a complete draw, or null when rounds are missing or don't fit together. */
export function reconstruct(matches: DrawMatch[]): Node | null {
  if (matches.length === 0) return null;
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  // Winners still in the draw, mapped to the subtree that produced them.
  const alive = new Map<string, Node>();
  const seen = new Set<string>();
  for (const r of rounds) {
    const inRound = matches.filter((m) => m.round === r);
    const next = new Map<string, Node>();
    for (const m of inRound) {
      const side = (key: string): Node | null => {
        const sub = alive.get(key);
        if (sub) {
          alive.delete(key);
          return sub;
        }
        // First appearance: a first-round entrant, or a bye into a later round.
        if (seen.has(key)) return null; // lost earlier: results don't fit together
        return { leaf: key };
      };
      const left = side(m.key1);
      const right = side(m.key2);
      if (!left || !right || m.key1 === m.key2) return null;
      seen.add(m.key1);
      seen.add(m.key2);
      next.set(winnerOf(m), { left, right, winner: winnerOf(m) });
    }
    // Anyone who won a match and didn't play this round must have been out of the draw; a gap.
    if (alive.size > 0 && r !== rounds[0]) return null;
    alive.clear();
    for (const [k, v] of next) alive.set(k, v);
  }
  return alive.size === 1 ? [...alive.values()][0] : null;
}

/** Players in a subtree. */
export function entrants(node: Node): string[] {
  return "leaf" in node ? [node.leaf] : [...entrants(node.left), ...entrants(node.right)];
}

/** Rounds from this node down to its deepest leaf. */
export function depth(node: Node): number {
  return "leaf" in node ? 0 : 1 + Math.max(depth(node.left), depth(node.right));
}

/**
 * Exact chance of each entrant winning the whole subtree, given p(a, b) = chance a beats b.
 * Each player must win their own half, then beat whoever wins the other half.
 */
export function winChances(node: Node, p: (a: string, b: string) => number): Map<string, number> {
  if ("leaf" in node) return new Map([[node.leaf, 1]]);
  const L = winChances(node.left, p);
  const R = winChances(node.right, p);
  const out = new Map<string, number>();
  for (const [x, px] of L) {
    let beat = 0;
    for (const [y, py] of R) beat += py * p(x, y);
    out.set(x, px * beat);
  }
  for (const [y, py] of R) {
    let beat = 0;
    for (const [x, px] of L) beat += px * p(y, x);
    out.set(y, py * beat);
  }
  return out;
}

/** The same bracket with one entrant's slot taken by someone else (for "what if they weren't there"). */
export function replaceLeaf(node: Node, key: string, by: string): Node {
  if ("leaf" in node) return node.leaf === key ? { leaf: by } : node;
  return { left: replaceLeaf(node.left, key, by), right: replaceLeaf(node.right, key, by), winner: node.winner };
}

/** Standard seeded bracket for a power-of-two field given in seed order (1 v 8, 4 v 5, 3 v 6, 2 v 7 …). */
export function seededBracket(keys: string[]): Node | null {
  const n = keys.length;
  if (n < 2 || (n & (n - 1)) !== 0) return null;
  // Seed positions: start with [1, 2] and expand each seed s into (s, size + 1 − s).
  let order = [1, 2];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  let level: Node[] = order.map((s) => ({ leaf: keys[s - 1] }));
  while (level.length > 1) {
    const next: Node[] = [];
    for (let i = 0; i < level.length; i += 2) next.push({ left: level[i], right: level[i + 1], winner: "" });
    level = next;
  }
  return level[0];
}

/** Each entrant's chance of winning at least r matches in this subtree (index 0 = 1, last = title). */
export function reachChances(node: Node, p: (a: string, b: string) => number): Map<string, number[]> {
  if ("leaf" in node) return new Map([[node.leaf, [1]]]);
  const L = reachChances(node.left, p);
  const R = reachChances(node.right, p);
  const out = new Map<string, number[]>();
  const step = (mine: Map<string, number[]>, other: Map<string, number[]>) => {
    for (const [x, arr] of mine) {
      const here = arr.at(-1)!;
      let beat = 0;
      for (const [y, yarr] of other) beat += yarr.at(-1)! * p(x, y);
      out.set(x, [...arr, here * beat]);
    }
  };
  step(L, R);
  step(R, L);
  return out;
}

/** A bracket from leaves in line order (neighbours meet in the first round). */
export function lineBracket(leaves: string[]): Node | null {
  const n = leaves.length;
  if (n < 2 || (n & (n - 1)) !== 0) return null;
  let level: Node[] = leaves.map((leaf) => ({ leaf }));
  while (level.length > 1) {
    const next: Node[] = [];
    for (let i = 0; i < level.length; i += 2) next.push({ left: level[i], right: level[i + 1], winner: "" });
    level = next;
  }
  return level[0];
}
