import { describe, expect, it } from "vitest";

import { botCall, eventAt, pointsForSets, type BotEvent } from "./party-demo";
import { replay } from "./scorekeeper";

const MATCHES: { sets: { a: number; b: number }[]; bestOf: 3 | 5 }[] = [
  { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }], bestOf: 3 },
  { sets: [{ a: 7, b: 6 }, { a: 3, b: 6 }, { a: 7, b: 5 }], bestOf: 3 },
  { sets: [{ a: 0, b: 6 }, { a: 6, b: 7 }], bestOf: 3 },
  { sets: [{ a: 6, b: 7 }, { a: 7, b: 6 }, { a: 4, b: 6 }, { a: 7, b: 5 }, { a: 7, b: 6 }], bestOf: 5 },
  { sets: [{ a: 6, b: 0 }, { a: 6, b: 0 }, { a: 6, b: 0 }], bestOf: 5 },
];

describe("pointsForSets", () => {
  it("replays to exactly the real set scores, for many seeds", () => {
    for (const m of MATCHES) {
      for (let seed = 1; seed <= 200; seed++) {
        const points = pointsForSets(m.sets, m.bestOf, seed);
        expect(points, `seed ${seed}`).not.toBeNull();
        const end = replay(points!, m.bestOf, true);
        expect(end.sets).toEqual(m.sets);
        expect(end.winner).toBe(m.sets.filter((s) => s.a > s.b).length > m.sets.length / 2 ? 1 : 2);
      }
    }
  });

  it("is deterministic per seed", () => {
    expect(pointsForSets(MATCHES[1].sets, 3, 42)).toEqual(pointsForSets(MATCHES[1].sets, 3, 42));
  });

  it("refuses incomplete matches (retirements)", () => {
    expect(pointsForSets([{ a: 6, b: 4 }, { a: 2, b: 1 }], 3, 1)).toBeNull();
    expect(pointsForSets([{ a: 6, b: 4 }], 3, 1)).toBeNull();
  });
});

describe("eventAt", () => {
  it("reports the start, one set event per set and the match", () => {
    const m = MATCHES[1];
    const points = pointsForSets(m.sets, m.bestOf, 7)!;
    const events = points.map((_, i) => eventAt(points, i, m.bestOf)).concat(eventAt(points, points.length, m.bestOf));
    const kinds = (k: BotEvent["kind"]) => events.filter((e) => e?.kind === k).length;
    expect(events[0]).toEqual({ kind: "start" });
    expect(kinds("set")).toBe(2);
    expect(kinds("match")).toBe(1);
    expect(kinds("tiebreak")).toBe(1);
    expect(events.at(-1)).toEqual({ kind: "match", side: 1 });
  });
});

describe("botCall", () => {
  it("favorite fan, underdog fan, and a stable coin flip", () => {
    expect(botCall(0, "match", 0.7, 1)).toBe(1);
    expect(botCall(1, "match", 0.7, 1)).toBe(2);
    expect(botCall(2, "set-2", 0.7, 9)).toBe(botCall(2, "set-2", 0.7, 9));
  });
});
