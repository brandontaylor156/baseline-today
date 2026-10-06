import { describe, expect, it } from "vitest";

import { entrants } from "./bracket";
import { forecast, randomDraw } from "./forecast";

const field = Array.from({ length: 128 }, (_, i) => `P${i + 1}`);

describe("randomDraw", () => {
  it("places every player once, keeps seeds 1 and 2 in opposite halves, and never lets top-4 seeds meet before the semis", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      const tree = randomDraw(field, rand)!;
      const line = entrants(tree);
      expect(new Set(line).size).toBe(128);
      const half = (k: string) => (line.indexOf(k) < 64 ? 0 : 1);
      const quarter = (k: string) => Math.floor(line.indexOf(k) / 32);
      expect(half("P1")).not.toBe(half("P2"));
      expect(new Set(["P1", "P2", "P3", "P4"].map(quarter)).size).toBe(4);
      // Seeds 1–32 are each in a different 4-player block (no seeded meeting before round 3).
      expect(new Set(field.slice(0, 32).map((k) => Math.floor(line.indexOf(k) / 4))).size).toBe(32);
    }
  });
});

describe("forecast", () => {
  it("gives the strongest player the best title chance and sums title chances to 1", () => {
    const strength = (k: string) => 200 - Number(k.slice(1));
    const p = (a: string, b: string) => 1 / (1 + 10 ** ((strength(b) - strength(a)) / 40));
    const out = forecast(field, p, 20, 3);
    const title = (k: string) => out.get(k)!.at(-1)!;
    expect(title("P1")).toBeGreaterThan(title("P2"));
    expect(title("P2")).toBeGreaterThan(title("P10"));
    expect([...out.values()].reduce((s, a) => s + a.at(-1)!, 0)).toBeCloseTo(1);
    expect(out.get("P1")).toHaveLength(8);
  });
});
