import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { finalsPoints, finalsQualifiers } from "./finals";

// The seeds and draw sections of "2025 ATP Finals – Singles" (Wikipedia, CC BY-SA 4.0).
const page = readFileSync(new URL("./__fixtures__/atp-finals-2025.txt", import.meta.url), "utf8");

describe("finalsPoints", () => {
  it("scores round-robin wins, semifinal wins and the title", () => {
    const pts = finalsPoints(page);
    expect(pts.get("Jannik Sinner")).toBe(1500);
    expect(pts.get("Carlos Alcaraz")).toBe(1000);
    expect(pts.get("Félix Auger-Aliassime")).toBe(400);
    expect(pts.get("Taylor Fritz")).toBe(200);
    expect(pts.get("Ben Shelton")).toBe(0);
    expect(pts.size).toBe(8);
    expect([...pts.values()].reduce((a, b) => a + b, 0)).toBe(12 * 200 + 2 * 400 + 500);
  });
});

describe("finalsQualifiers", () => {
  it("lists the eight who qualified, including a withdrawal, not the alternate who replaced him", () => {
    const q = finalsQualifiers(page);
    expect(q).toHaveLength(8);
    expect(q).toContain("Novak Djokovic");
    expect(q).toContain("Taylor Fritz");
    expect(q).not.toContain("Lorenzo Musetti");
  });
});
