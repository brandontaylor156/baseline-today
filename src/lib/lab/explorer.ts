// Results explorer (pure, unit tested): one player's matches from their side, the filters a
// query string can carry, and the splits shown for whatever matches.

export interface Line {
  matchId: number;
  season: number | null;
  date: string;
  tournamentId: number;
  tournament: string;
  category: string | null;
  surface: "Hard" | "Clay" | "Grass" | null;
  round: string | null;
  /** 1 = first round … 7 = final. */
  roundRank: number;
  opponent: { id: number | null; name: string; country: string | null };
  won: boolean;
  /** Sets from the player's side. */
  sets: [number, number][];
  /** The player's pre-match chance, by our model. */
  chance: number | null;
  retired: boolean;
  walkover: boolean;
}

export interface Filters {
  opponent?: number;
  surface?: "Hard" | "Clay" | "Grass";
  from?: number;
  to?: number;
  /** "early" (before the quarterfinals) | "qf" | "sf" | "f" */
  stage?: "early" | "qf" | "sf" | "f";
  category?: "slam" | "1000" | "500" | "250";
  result?: "w" | "l";
  role?: "favourite" | "underdog";
  deciding?: boolean;
  tiebreak?: boolean;
}

/** Filters from URL search params; anything unrecognised is ignored. */
export function parseFilters(q: Record<string, string | string[] | undefined>): Filters {
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const n = (k: string) => (s(k) && /^\d{1,9}$/.test(s(k)!) ? Number(s(k)) : undefined);
  const pick = <T extends string>(k: string, allowed: readonly T[]) => (allowed.includes(s(k) as T) ? (s(k) as T) : undefined);
  return {
    opponent: n("o"),
    surface: pick("surface", ["Hard", "Clay", "Grass"] as const),
    from: n("from"),
    to: n("to"),
    stage: pick("stage", ["early", "qf", "sf", "f"] as const),
    category: pick("cat", ["slam", "1000", "500", "250"] as const),
    result: pick("result", ["w", "l"] as const),
    role: pick("role", ["favourite", "underdog"] as const),
    deciding: s("deciding") === "1" || undefined,
    tiebreak: s("tb") === "1" || undefined,
  };
}

const STAGE: Record<NonNullable<Filters["stage"]>, (r: number) => boolean> = { early: (r) => r <= 4, qf: (r) => r === 5, sf: (r) => r === 6, f: (r) => r === 7 };
const CATEGORY: Record<NonNullable<Filters["category"]>, RegExp> = { slam: /grand slam/i, "1000": /1000/, "500": /500/, "250": /250/ };

export function applyFilters(lines: Line[], f: Filters, bestOf = (l: Line) => (/grand slam/i.test(l.category ?? "") ? 5 : 3)): Line[] {
  return lines.filter((l) => {
    if (l.walkover) return false;
    if (f.opponent !== undefined && l.opponent.id !== f.opponent) return false;
    if (f.surface && l.surface !== f.surface) return false;
    if (f.from && (l.season ?? 0) < f.from) return false;
    if (f.to && (l.season ?? 9999) > f.to) return false;
    if (f.stage && !STAGE[f.stage](l.roundRank)) return false;
    if (f.category && !CATEGORY[f.category].test(l.category ?? "")) return false;
    if (f.result && l.won !== (f.result === "w")) return false;
    if (f.role && (l.chance === null || (f.role === "favourite" ? l.chance < 0.5 : l.chance >= 0.5))) return false;
    if (f.deciding && l.sets.length !== bestOf(l)) return false;
    if (f.tiebreak && !l.sets.some(([a, b]) => Math.max(a, b) === 7 && Math.min(a, b) === 6)) return false;
    return true;
  });
}

export interface Split {
  key: string;
  w: number;
  l: number;
}

/** Win-loss overall and split by a key, in the order keys first appear unless sorted. */
export function splits(lines: Line[], key: (l: Line) => string | null): Split[] {
  const map = new Map<string, Split>();
  for (const l of lines) {
    const k = key(l);
    if (k === null) continue;
    const s = map.get(k) ?? { key: k, w: 0, l: 0 };
    if (l.won) s.w++;
    else s.l++;
    map.set(k, s);
  }
  return [...map.values()];
}

/** Wins above what the model expected: Σ(won) − Σ(chance), over lines with a chance. */
export function winsAboveExpected(lines: Line[]): { n: number; expected: number; actual: number } {
  const scored = lines.filter((l) => l.chance !== null);
  return { n: scored.length, expected: scored.reduce((s, l) => s + l.chance!, 0), actual: scored.filter((l) => l.won).length };
}
