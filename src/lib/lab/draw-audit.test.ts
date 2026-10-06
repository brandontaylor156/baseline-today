import { describe, expect, it } from "vitest";

import { auditDraw, benjaminiHochberg, type AuditLine } from "./draw-audit";

// 32 lines; seeds 1–8 at their usual lines; unseeded players rated 1500–1810.
const seedAt: Record<number, number> = { 0: 1, 31: 2, 16: 3, 15: 4, 8: 5, 23: 6, 24: 7, 7: 8 };
function draw(rigged: boolean): { lines: AuditLine[]; rating: (k: string) => number | null } {
  const ratings = new Map<string, number>();
  const unseededPositions = Array.from({ length: 32 }, (_, i) => i).filter((p) => !(p in seedAt));
  // Rigged: the eight weakest unseeded players sit next to the eight seeds.
  const partnerSlots = Object.keys(seedAt).map((p) => Number(p) ^ 1);
  const order = rigged ? [...partnerSlots, ...unseededPositions.filter((p) => !partnerSlots.includes(p))] : unseededPositions;
  const lines: AuditLine[] = [];
  order.forEach((p, i) => {
    ratings.set(`u${i}`, 1500 + i * 13);
    lines.push({ position: p, key: `u${i}`, seed: null });
  });
  for (const [p, s] of Object.entries(seedAt)) {
    lines.push({ position: Number(p), key: `s${s}`, seed: s });
    ratings.set(`s${s}`, 2000);
  }
  return { lines, rating: (k) => ratings.get(k) ?? null };
}

describe("auditDraw", () => {
  it("flags a draw where the top seeds all got the weakest opponents", () => {
    const { lines, rating } = draw(true);
    const r = auditDraw(lines, rating)!;
    expect(r.observed).toBeLessThan(r.expected);
    expect(r.p).toBeLessThan(0.01);
  });
  it("finds nothing unusual in an ordinary draw", () => {
    const { lines, rating } = draw(false);
    expect(auditDraw(lines, rating)!.p).toBeGreaterThan(0.05);
  });
});

describe("benjaminiHochberg", () => {
  it("keeps only p-values that survive the false discovery rate", () => {
    expect(benjaminiHochberg([0.001, 0.04, 0.3, 0.8])).toEqual([true, false, false, false]);
    expect(benjaminiHochberg([0.01, 0.02, 0.03, 0.04])).toEqual([true, true, true, true]);
  });
});
