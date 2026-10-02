// Fixtures are snapshots of English Wikipedia draw pages (CC BY-SA 4.0), see test/fixtures/wiki/.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { meetingRound } from "../title-odds";

import { drawSection, isPlausibleResult, parseDraw, parseDrawLines, parseScore, type WikiMatch } from "./draw-parse";
import { nameKeys, normalizeName } from "./names";

const fixture = (name: string) => readFileSync(new URL(`../../../test/fixtures/wiki/${name}.wikitext`, import.meta.url), "utf8");
const find = (ms: WikiMatch[], a: string, b: string) =>
  ms.find((m) => [m.p1.name, m.p2.name].map(normalizeName).sort().join() === [a, b].map(normalizeName).sort().join());

describe("parseDraw on real pages", () => {
  it("reads a 96-player WTA 1000 draw, main draw only", () => {
    const ms = parseDraw(fixture("2026-china-open--womens-singles"), normalizeName);
    expect(ms.filter((m) => m.round === "First round")).toHaveLength(32);
    expect(ms.some((m) => /qualif/i.test(m.round))).toBe(false);

    const samsonova = find(ms, "Liudmila Samsonova", "Linda Fruhvirtová")!;
    expect(samsonova.round).toBe("Second round");
    expect(samsonova.winner).toBe(2);
    expect(samsonova.sets.map((s) => [s.p1, s.p2])).toEqual([
      [2, 6],
      [6, 3],
      [3, 6],
    ]);
    expect(samsonova.p1).toMatchObject({ country: "CZE", seed: "LL" });
  });

  it("marks retirements", () => {
    const ms = parseDraw(fixture("2026-china-open--womens-singles"), normalizeName);
    const kraus = find(ms, "Sinja Kraus", "Anastasia Potapova")!;
    expect(kraus.detail).toBe("retired");
    expect(isPlausibleResult(kraus)).toBe(true);
  });

  it("reads a complete best-of-five Grand Slam draw", () => {
    const ms = parseDraw(fixture("2026-us-open--mens-singles"), normalizeName);
    expect(ms).toHaveLength(127);
    expect(ms.every((m) => m.winner !== null && isPlausibleResult(m, 5))).toBe(true);
    expect(ms.filter((m) => m.round === "Final")).toHaveLength(1);
  });

  it("merges semifinals listed in both a half bracket and the finals bracket", () => {
    const text = fixture("2026-japan-open-tennis-championships--singles");
    const ms = parseDraw(text, normalizeName);
    const semis = ms.filter((m) => m.round === "Semifinals");
    expect(semis.length).toBeLessThanOrEqual(2);
    expect(drawSection(text)).not.toMatch(/First qualifier/);
  });

  it("reads tiebreaks", () => {
    const ms = parseDraw(fixture("2026-us-open--mens-singles"), normalizeName);
    const tiebreak = ms.flatMap((m) => m.sets).find((s) => s.p1Tiebreak !== null || s.p2Tiebreak !== null)!;
    expect([tiebreak.p1, tiebreak.p2].sort()).toEqual([6, 7]);
  });
});

describe("duplicate brackets", () => {
  it("merges a semifinal whose player is linked differently in two brackets", () => {
    const bracket = (name: string) => `{{4TeamBracket-Tennis3
| RD1=Semifinals
| RD1-team1='''[[${name}]]'''
| RD1-score1-1=6
| RD1-score1-2=6
| RD1-team2=[[Luciano Darderi]]
| RD1-score2-1=4
| RD1-score2-2=4
}}`;
    const text = `==Draw==
${bracket("Daniel Vallejo")}
${bracket("Adolfo Daniel Vallejo")}
==References==`;
    expect(parseDraw(text, normalizeName)).toHaveLength(1);
  });
});

describe("Italian Wikipedia pages", () => {
  const ms = parseDraw(fixture("it-parma-ladies-open-2026-singolare"), normalizeName);

  it("reads the Tabellone section with Italian templates and translated rounds", () => {
    expect(ms.filter((m) => m.round === "First round")).toHaveLength(16);
    expect(ms.filter((m) => m.round === "Semifinals")).toHaveLength(2); // half + finals brackets merged
    expect(ms.filter((m) => m.round === "Final")).toHaveLength(1);
    expect(new Set(ms.map((m) => m.round))).toEqual(new Set(["First round", "Second round", "Quarterfinals", "Semifinals", "Final"]));
  });

  it("infers winners from scores (no bold) and keeps flags", () => {
    const semi = find(ms, "Camila Osorio", "Barbora Krejčíková")!;
    expect(semi.winner).toBe(2); // 2-6 6-1 7-5 from Krejčíková's side
    expect(semi.p1.country).toBe("COL");
    expect(isPlausibleResult(semi)).toBe(true);
    const tb = find(ms, "Dajana Jastrems'ka", "Jéssica Bouzas Maneiro")!;
    expect(tb.winner).toBe(1); // 7-6 6-7 7-6
  });

  it("finds a result for every finished match", () => {
    expect(ms.filter((m) => m.winner !== null).every((m) => isPlausibleResult(m))).toBe(true);
    expect(ms.filter((m) => m.winner !== null).length).toBe(31);
  });
});

describe("parseScore", () => {
  it("handles bold, tiebreaks, retirements and walkovers", () => {
    expect(parseScore("'''7<sup>7</sup>'''")).toEqual({ games: 7, tiebreak: 7, retired: false, walkover: false });
    expect(parseScore("1<sup>r</sup>")).toMatchObject({ games: 1, retired: true });
    expect(parseScore("w/o")).toMatchObject({ walkover: true, games: null });
    expect(parseScore("")).toMatchObject({ games: null });
  });
});

describe("isPlausibleResult", () => {
  const side = { name: "A", country: null, seed: null };
  const m = (sets: [number, number][], winner: 1 | 2 | null, detail: WikiMatch["detail"] = null): WikiMatch => ({
    round: "R1",
    p1: side,
    p2: { ...side, name: "B" },
    winner,
    detail,
    sets: sets.map(([p1, p2]) => ({ p1, p2, p1Tiebreak: null, p2Tiebreak: null })),
  });

  it("accepts normal results and rejects half-entered or vandalized ones", () => {
    expect(isPlausibleResult(m([[6, 4], [7, 6]], 1))).toBe(true);
    expect(isPlausibleResult(m([[6, 4], [3, 6], [6, 3]], 1))).toBe(true);
    expect(isPlausibleResult(m([[6, 4], [7, 6]], 2))).toBe(false); // bold on the loser
    expect(isPlausibleResult(m([[6, 4]], 1))).toBe(false); // unfinished
    expect(isPlausibleResult(m([[6, 4], [4, 2]], 1))).toBe(false); // set in progress
    expect(isPlausibleResult(m([[16, 4], [6, 2]], 1))).toBe(false); // nonsense games
    expect(isPlausibleResult(m([[6, 4], [7, 6]], null))).toBe(false); // no winner yet
    expect(isPlausibleResult(m([[6, 4], [2, 1]], 1, "retired"))).toBe(true);
    expect(isPlausibleResult(m([], 2, "walkover"))).toBe(true);
  });
});

describe("names", () => {
  it("normalizes like the database search key", () => {
    expect(normalizeName("Karolína Muchová")).toBe("karolina muchova");
    expect(normalizeName("Novak Đoković")).toBe("novak djokovic");
    expect(normalizeName("Felix Auger-Aliassime")).toBe("felix auger-aliassime");
  });

  it("offers the reversed order for two-word names", () => {
    expect(nameKeys("Zhang Shuai")).toEqual(["zhang shuai", "shuai zhang"]);
  });
});

describe("parseDrawLines", () => {
  // Round number counted from the first round, from the page's label and the draw size.
  const roundNumber = (label: string, rounds: number) => {
    const fromEnd: Record<string, number> = { Final: 0, Semifinals: 1, Quarterfinals: 2 };
    if (label in fromEnd) return rounds - fromEnd[label];
    return ["First round", "Second round", "Third round", "Fourth round"].indexOf(label) + 1;
  };

  it.each([
    ["2026-china-open--womens-singles", 128],
    ["2026-us-open--mens-singles", 128],
    ["2026-japan-open-tennis-championships--singles", 32],
    ["2026-jingshan-tennis-open--womens-singles", 32],
    ["it-parma-ladies-open-2026-singolare", 32],
  ])("%s: every match is between players who meet in that round", (name, size) => {
    const text = fixture(name);
    const draw = parseDrawLines(text)!;
    expect(draw.size).toBe(size);
    const pos = new Map(draw.lines.map((l) => [normalizeName(l.name), l.position]));
    const matches = parseDraw(text, normalizeName);
    const rounds = Math.log2(size);
    let checked = 0;
    for (const m of matches) {
      const a = pos.get(normalizeName(m.p1.name));
      const b = pos.get(normalizeName(m.p2.name));
      expect(a, m.p1.name).toBeDefined();
      expect(b, m.p2.name).toBeDefined();
      expect(meetingRound(a!, b!), `${m.round}: ${m.p1.name} v ${m.p2.name}`).toBe(roundNumber(m.round, rounds));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("puts a seeded player with a bye at the top of their block", () => {
    const draw = parseDrawLines(fixture("2026-china-open--womens-singles"))!;
    expect(draw.lines[0].position).toBe(0);
    expect(draw.lines[0].seed).toBe("1");
    expect(draw.lines.length).toBeLessThanOrEqual(96);
  });

  it("rejects pages without a bracket", () => {
    expect(parseDrawLines(["== Draw ==", "No bracket yet."].join("\n"))).toBeNull();
  });
});
