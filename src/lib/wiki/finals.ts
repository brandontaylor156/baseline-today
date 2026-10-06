// Season-finals ranking points from a Wikipedia "<year> ATP/WTA Finals – Singles" page (pure, unit
// tested): 200 for each round-robin win (the groups' W–L column), 400 for winning the semifinal and
// 500 for the title (the bold side of the knockout bracket).

const linkName = (s: string) => s.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/)?.[1]?.replace(/\s*\([^)]*\)$/, "").trim() ?? null;
const bold = (s: string) => s.includes("'''");

function blocks(wikitext: string, template: RegExp): string[] {
  const out: string[] = [];
  for (const m of wikitext.matchAll(template)) {
    // The template body up to its matching closing braces.
    let depth = 0;
    let i = m.index!;
    for (; i < wikitext.length - 1; i++) {
      if (wikitext.startsWith("{{", i)) {
        depth++;
        i++;
      } else if (wikitext.startsWith("}}", i)) {
        depth--;
        i++;
        if (depth === 0) break;
      }
    }
    out.push(wikitext.slice(m.index!, i + 1));
  }
  return out;
}

/** Template parameters: one per line, or several on a line separated by " |". */
const params = (body: string) =>
  new Map(
    body
      .split(/\n\s*\||\s\|(?=[\w/-]+=)/)
      .map((line) => line.match(/^\s*\|?\s*([\w/-]+)\s*=([\s\S]*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2].trim()]),
  );

export function finalsPoints(wikitext: string): Map<string, number> {
  const pts = new Map<string, number>();
  const add = (name: string | null, n: number) => {
    if (name) pts.set(name, (pts.get(name) ?? 0) + n);
  };
  for (const body of blocks(wikitext, /\{\{4TeamRR/g)) {
    const p = params(body);
    for (let n = 1; n <= 4; n++) {
      const wins = Number(p.get(`match-w/l-${n}`)?.replace(/'''/g, "").match(/^(\d)\s*[–-]/)?.[1]);
      add(linkName(p.get(`team-${n}`) ?? ""), Number.isFinite(wins) ? wins * 200 : 0);
    }
  }
  const bracket = blocks(wikitext, /\{\{4TeamBracket/g)[0];
  if (bracket) {
    const p = params(bracket);
    for (let n = 1; n <= 4; n++) {
      const team = p.get(`RD1-team${n}`) ?? "";
      if (bold(team)) add(linkName(team), 400);
    }
    for (let n = 1; n <= 2; n++) {
      const team = p.get(`RD2-team${n}`) ?? "";
      if (bold(team)) add(linkName(team), 500);
    }
  }
  return pts;
}

/** The players who qualified, in race order: the first `spots` of the Seeds list (withdrawals included). */
export function finalsQualifiers(wikitext: string, spots = 8): string[] {
  const start = wikitext.search(/==\s*Seeds\s*==/);
  if (start < 0) return [];
  const section = wikitext.slice(start).split(/\n==[^=]/)[0];
  return section
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .map((line) => linkName(line))
    .filter((n): n is string => n !== null)
    .slice(0, spots);
}
