import { describe, expect, it } from "vitest";

import { replay } from "./scorekeeper";

const game = (side: 1 | 2): (1 | 2)[] => [side, side, side, side];
const games = (side: 1 | 2, n: number) => Array.from({ length: n }, () => game(side)).flat();

describe("replay", () => {
  it("counts points, games and serve changes", () => {
    const s = replay([1, 1, 2], 3, true);
    expect([s.gameA, s.gameB]).toEqual(["30", "15"]);
    const g = replay(game(1), 3, true);
    expect(g.sets).toEqual([{ a: 1, b: 0 }]);
    expect(g.serverA).toBe(false);
  });

  it("handles deuce and advantage", () => {
    const s = replay([1, 1, 1, 2, 2, 2, 1], 3, true);
    expect([s.gameA, s.gameB]).toEqual(["AD", "40"]);
    expect(s.state.pointsA).toBe(4);
    const back = replay([1, 1, 1, 2, 2, 2, 1, 2], 3, true);
    expect([back.gameA, back.gameB]).toEqual(["40", "40"]);
  });

  it("wins a set 6-4 and starts the next", () => {
    const s = replay([...games(1, 5), ...games(2, 4), ...game(1)], 3, true);
    expect(s.sets).toEqual([{ a: 6, b: 4 }, { a: 0, b: 0 }]);
    expect(s.setsA).toBe(1);
  });

  it("plays a tiebreak at 6-6 and alternates its serve", () => {
    const toSixAll = [...games(1, 5), ...games(2, 5), ...game(1), ...game(2)];
    const s = replay([...toSixAll, 1, 2, 2], 3, true);
    expect(s.tiebreak).toBe(true);
    expect([s.gameA, s.gameB]).toEqual(["1", "2"]);
    const done = replay([...toSixAll, ...Array(7).fill(1)], 3, true);
    expect(done.sets[0]).toEqual({ a: 7, b: 6 });
    expect(done.setsA).toBe(1);
  });

  it("ends the match and ignores later points", () => {
    const s = replay([...games(2, 6), ...games(2, 6), ...game(1)], 3, true);
    expect(s.winner).toBe(2);
    expect(s.setsB).toBe(2);
    expect(s.sets).toHaveLength(2);
  });
});
