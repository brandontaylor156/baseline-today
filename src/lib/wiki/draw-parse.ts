// Parser for Wikipedia tennis draw pages ("2026 China Open – Women's singles" etc.). Pure and
// unit tested against real page snapshots. Only the "Draw" section is read (never qualifying).
//
// Bracket templates ({{16TeamBracket-Compact-Tennis3-Byes}}, {{8TeamBracket-Tennis5}}, …) use:
//   | RD1=First round                      round labels
//   | RD1-seed03=Q                         seed or entry (Q, WC, LL, PR, 1…)
//   | RD1-team03='''{{flagicon|GBR}} [[Katie Boulter|K Boulter]]'''   bold = winner
//   | RD1-score03-1='''7<sup>7</sup>'''    games, tiebreak in <sup>, "1<sup>r</sup>" = retired
// Odd and even slots of a round play each other.

export interface WikiSide {
  name: string; // full name from the link target, disambiguation removed
  country: string | null; // IOC code from {{flagicon}}
  seed: string | null;
}

export interface WikiSet {
  p1: number | null;
  p2: number | null;
  p1Tiebreak: number | null;
  p2Tiebreak: number | null;
}

export interface WikiMatch {
  round: string; // label from the template, e.g. "Quarterfinals"
  p1: WikiSide;
  p2: WikiSide;
  winner: 1 | 2 | null;
  sets: WikiSet[];
  detail: "retired" | "walkover" | null;
}

/** Text of the level-2 "Draw" section (up to the next level-2 heading). */
export function drawSection(wikitext: string): string {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((l) => /^==\s*(Draw|Tabellone)\s*==\s*$/i.test(l.trim()));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^==[^=].*[^=]==\s*$/.test(l.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** Splits text into bracket template bodies (handles nested {{…}} inside). */
export function bracketBodies(text: string): string[] {
  const bodies: string[] = [];
  // English {{16TeamBracket-…}}; Italian {{torneo-tennis-4 colonne}} and {{Torneo semifinali 3-3}}.
  const re = /\{\{\s*(?:\d+TeamBracket|torneo[- ]tennis|Torneo semifinali)[^|}]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0;
    let i = m.index;
    for (; i < text.length - 1; i++) {
      if (text[i] === "{" && text[i + 1] === "{") {
        depth++;
        i++;
      } else if (text[i] === "}" && text[i + 1] === "}") {
        depth--;
        i++;
        if (depth === 0) break;
      }
    }
    bodies.push(text.slice(m.index, i + 1));
    re.lastIndex = i + 1;
  }
  return bodies;
}

function cleanName(raw: string): string | null {
  const link = raw.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/);
  const name = link ? link[1] : raw.replace(/\{\{[^}]*\}\}|'''|''|<[^>]+>|\[|\]/g, "");
  const cleaned = name
    .replace(/\s*\([^)]*\)\s*$/, "") // "John Smith (tennis)"
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned && !/^(bye|tbd|&nbsp;)$/i.test(cleaned) ? cleaned : null;
}

interface Score {
  games: number | null;
  tiebreak: number | null;
  retired: boolean;
  walkover: boolean;
}

export function parseScore(raw: string): Score {
  const text = raw.replace(/'''/g, "").trim();
  if (/w\/o|walkover/i.test(text)) return { games: null, tiebreak: null, retired: false, walkover: true };
  // "1<sup>r</sup>", "3 ret.", "rit.", or a lone "r" in the next set's field.
  const retired = /<sup>\s*(r|ret|rit)\.?\s*<\/sup>|\bret\.?(?=\s|$)|\brit\.?(?=\s|$)|^r\.?$/i.test(text);
  const games = text.match(/^(\d+)/);
  const tb = text.match(/<sup>\s*(\d+)\s*<\/sup>/);
  return { games: games ? Number(games[1]) : null, tiebreak: tb ? Number(tb[1]) : null, retired, walkover: false };
}

interface Slot {
  team?: string;
  bold?: boolean;
  country?: string | null;
  seed?: string | null;
  scores: Score[];
}

export function parseBracket(body: string): WikiMatch[] {
  const labels: Record<string, string> = {};
  const slots: Record<string, Record<number, Slot>> = {};

  // Parameters are "| name = value"; values never contain a top-level "|" in these templates
  // except inside [[link|label]] and {{flagicon|X}}, so split on newlines where params start.
  for (const line of body.split("\n")) {
    const label = line.match(/^\s*\|\s*(RD\d+)\s*=\s*(.+?)\s*$/);
    if (label) {
      labels[label[1]] = label[2].replace(/'''|''|\[\[|\]\]/g, "").trim();
      continue;
    }
    const p = line.match(/^\s*\|\s*(RD\d+)-(seed|team|score)0*(\d+)(?:-(\d+))?\s*=\s*(.*?)\s*$/);
    if (!p) continue;
    const [, rd, kind, slotStr, setStr, value] = p;
    const slot = Number(slotStr);
    const s = ((slots[rd] ??= {})[slot] ??= { scores: [] });
    if (kind === "team") {
      s.team = value;
      s.bold = /'''/.test(value);
      s.country = value.match(/\{\{\s*(?:flag(?:icon|athlete)?|bandiera)\s*\|\s*([A-Za-z]{3})/i)?.[1]?.toUpperCase() ?? null;
    } else if (kind === "seed") {
      s.seed = value.replace(/'''/g, "").trim() || null;
    } else if (setStr) {
      s.scores[Number(setStr) - 1] = parseScore(value);
    }
  }

  const matches: WikiMatch[] = [];
  for (const [rd, bySlot] of Object.entries(slots)) {
    for (const [slotStr, a] of Object.entries(bySlot)) {
      const slot = Number(slotStr);
      if (slot % 2 === 0) continue;
      const b = bySlot[slot + 1];
      const n1 = a.team ? cleanName(a.team) : null;
      const n2 = b?.team ? cleanName(b.team) : null;
      if (!n1 || !n2 || !b) continue; // byes and empty slots

      const setCount = Math.max(a.scores.length, b.scores.length);
      const sets: WikiSet[] = [];
      for (let i = 0; i < setCount; i++) {
        const x = a.scores[i];
        const y = b.scores[i];
        if (x?.games == null && y?.games == null) continue;
        sets.push({ p1: x?.games ?? null, p2: y?.games ?? null, p1Tiebreak: x?.tiebreak ?? null, p2Tiebreak: y?.tiebreak ?? null });
      }
      const walkover = [...a.scores, ...b.scores].some((s) => s?.walkover);
      const retired = [...a.scores, ...b.scores].some((s) => s?.retired);
      // English pages bold the winner; Italian pages don't, so fall back to the score.
      const winner: 1 | 2 | null =
        a.bold && !b.bold ? 1 : b.bold && !a.bold ? 2 : !a.bold && !b.bold ? winnerFromScore(a.scores, b.scores, sets) : null;

      matches.push({
        round: englishRound(labels[rd] ?? rd),
        p1: { name: n1, country: a.country ?? null, seed: a.seed ?? null },
        p2: { name: n2, country: b.country ?? null, seed: b.seed ?? null },
        winner,
        sets,
        detail: walkover ? "walkover" : retired ? "retired" : null,
      });
    }
  }
  return matches;
}

const ITALIAN_ROUNDS: [RegExp, string][] = [
  [/^primo turno$/i, "First round"],
  [/^secondo turno$/i, "Second round"],
  [/^terzo turno$/i, "Third round"],
  [/^(quarto turno|ottavi di finale)$/i, "Fourth round"],
  [/^quarti di finale$/i, "Quarterfinals"],
  [/^semifinal[ei]$/i, "Semifinals"],
  [/^finale$/i, "Final"],
];

/** Round labels in English whatever the page language (so pages dedupe and sort alike). */
export function englishRound(label: string): string {
  for (const [re, english] of ITALIAN_ROUNDS) if (re.test(label.trim())) return english;
  return label;
}

/**
 * Winner from the set scores, for pages that don't bold winners: the side whose opponent retired,
 * or the side that won the majority of completed sets (the plausibility check verifies the rest).
 */
function winnerFromScore(a: Score[], b: Score[], sets: WikiSet[]): 1 | 2 | null {
  if (a.some((s) => s?.retired)) return 2;
  if (b.some((s) => s?.retired)) return 1;
  let p1 = 0;
  let p2 = 0;
  for (const s of sets) {
    if (s.p1 === null || s.p2 === null) return null;
    const hi = Math.max(s.p1, s.p2);
    const lo = Math.min(s.p1, s.p2);
    const complete = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
    if (!complete) return null; // match still in progress
    if (s.p1 > s.p2) p1++;
    else p2++;
  }
  if (Math.max(p1, p2) < 2 || p1 === p2) return null;
  return p1 > p2 ? 1 : 2;
}

const roundKey = (round: string) => round.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Stable identity of a match on a page: round + both players’ last names (order-free). Last
 * names, because editors link the same player differently across brackets ("Daniel Vallejo" vs
 * "Adolfo Daniel Vallejo"); it also survives later relinking.
 */
export function matchIdentity(m: Pick<WikiMatch, "round" | "p1" | "p2">, normalize: (s: string) => string): string {
  const last = (n: string) => normalize(n).split(" ").at(-1) ?? "";
  const names = [last(m.p1.name), last(m.p2.name)].sort();
  return `${roundKey(m.round)}|${names[0]}|${names[1]}`;
}

/**
 * All main-draw matches on a page. A semifinal can appear both in a half's bracket and in the
 * finals bracket; duplicates are merged, preferring the copy that has a result.
 */
export function parseDraw(wikitext: string, normalize: (s: string) => string): WikiMatch[] {
  const byId = new Map<string, WikiMatch>();
  for (const body of bracketBodies(drawSection(wikitext))) {
    for (const m of parseBracket(body)) {
      const id = matchIdentity(m, normalize);
      const prev = byId.get(id);
      if (!prev || (prev.winner === null && m.winner !== null)) byId.set(id, m);
    }
  }
  return [...byId.values()];
}

/**
 * Plausibility check before a result is stored: a winner, sets won by the winner (unless the
 * opponent retired or there was a walkover), and believable games in every set.
 */
export function isPlausibleResult(m: WikiMatch, bestOf: 3 | 5 = 3): boolean {
  if (m.winner === null) return false;
  if (m.detail === "walkover") return true;
  if (m.sets.length === 0) return false;

  let p1Sets = 0;
  let p2Sets = 0;
  for (const s of m.sets) {
    if (s.p1 === null || s.p2 === null) {
      if (m.detail === "retired") continue;
      return false;
    }
    if (s.p1 > 7 || s.p2 > 7 || s.p1 < 0 || s.p2 < 0) return false;
    const hi = Math.max(s.p1, s.p2);
    const lo = Math.min(s.p1, s.p2);
    const complete = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
    if (complete) {
      if (s.p1 > s.p2) p1Sets++;
      else p2Sets++;
    } else if (m.detail !== "retired") {
      return false; // unfinished set without a retirement
    }
  }
  if (m.detail === "retired") return true;
  const need = Math.ceil(bestOf / 2);
  const winnerSets = m.winner === 1 ? p1Sets : p2Sets;
  const loserSets = m.winner === 1 ? p2Sets : p1Sets;
  return winnerSets === need && loserSets < need;
}
