// Player and season statistics from stored results (pure, unit tested).

export interface StatSet {
  p1: number | null;
  p2: number | null;
}

export interface StatMatch {
  id: number;
  season: number | null;
  date: string; // tournament start, YYYY-MM-DD
  roundRank: number;
  round: string | null;
  surface: string | null;
  bestOf: 3 | 5;
  side: 1 | 2; // which side the player was on
  winner: 1 | 2;
  walkover: boolean;
  retired: boolean;
  sets: StatSet[];
}

export interface WL {
  w: number;
  l: number;
}

export interface PlayerStats {
  overall: WL;
  bySurface: { surface: string; w: number; l: number }[];
  tiebreaks: WL;
  decidingSets: WL;
  comebacks: number;
  titles: number;
  /** Most recent first: true = won. */
  form: boolean[];
  streak: { won: boolean; length: number } | null;
}

const surfaceName = (s: string | null) => {
  const x = (s ?? "").toLowerCase();
  return x.includes("clay") ? "Clay" : x.includes("grass") ? "Grass" : x.includes("hard") || x.includes("carpet") ? "Hard" : "Other";
};

function isComplete(s: StatSet) {
  if (s.p1 === null || s.p2 === null) return false;
  const hi = Math.max(s.p1, s.p2);
  const lo = Math.min(s.p1, s.p2);
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}

export function playerStats(matches: StatMatch[]): PlayerStats {
  const counted = matches.filter((m) => !m.walkover);
  const sorted = [...counted].sort((a, b) => b.date.localeCompare(a.date) || b.roundRank - a.roundRank);
  const won = (m: StatMatch) => m.winner === m.side;

  const overall = { w: 0, l: 0 };
  const surfaces = new Map<string, WL>();
  const tiebreaks = { w: 0, l: 0 };
  const decidingSets = { w: 0, l: 0 };
  let comebacks = 0;
  let titles = 0;

  for (const m of counted) {
    const win = won(m);
    if (win) overall.w++;
    else overall.l++;
    const s = surfaces.get(surfaceName(m.surface)) ?? { w: 0, l: 0 };
    if (win) s.w++;
    else s.l++;
    surfaces.set(surfaceName(m.surface), s);

    for (const set of m.sets) {
      if (set.p1 === null || set.p2 === null) continue;
      if (Math.max(set.p1, set.p2) === 7 && Math.min(set.p1, set.p2) === 6) {
        const mine = m.side === 1 ? set.p1 : set.p2;
        if (mine === 7) tiebreaks.w++;
        else tiebreaks.l++;
      }
    }

    const complete = m.sets.filter(isComplete);
    if (!m.retired && complete.length === m.bestOf) {
      if (win) decidingSets.w++;
      else decidingSets.l++;
    }
    const first = m.sets[0];
    if (win && first && isComplete(first)) {
      const mine = m.side === 1 ? first.p1! : first.p2!;
      const theirs = m.side === 1 ? first.p2! : first.p1!;
      if (mine < theirs) comebacks++;
    }
    if (win && /^final(s)?$/i.test(m.round ?? "")) titles++;
  }

  const form = sorted.slice(0, 10).map(won);
  let streak: PlayerStats["streak"] = null;
  if (sorted.length) {
    const first = won(sorted[0]);
    let length = 0;
    for (const m of sorted) {
      if (won(m) !== first) break;
      length++;
    }
    streak = { won: first, length };
  }

  const order = ["Hard", "Clay", "Grass", "Other"];
  return {
    overall,
    bySurface: [...surfaces.entries()].map(([surface, v]) => ({ surface, ...v })).sort((a, b) => order.indexOf(a.surface) - order.indexOf(b.surface)),
    tiebreaks,
    decidingSets,
    comebacks,
    titles,
    form,
    streak,
  };
}

export const winPct = (x: WL) => (x.w + x.l === 0 ? null : x.w / (x.w + x.l));
