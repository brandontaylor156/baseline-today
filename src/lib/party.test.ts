import { describe, expect, it } from "vitest";

import { callTable, decided, momentum, openCalls, roomModel } from "./party";
import { replay } from "./scorekeeper";

const game = (side: 1 | 2): (1 | 2)[] => [side, side, side, side];
const games = (side: 1 | 2, n: number) => Array.from({ length: n }, () => game(side)).flat();

describe("openCalls", () => {
  it("opens the match and first-set calls at the start, then closes them", () => {
    expect(openCalls(replay([], 3, true))).toEqual(["match", "set-1"]);
    expect(openCalls(replay(game(1), 3, true))).toEqual(["match"]);
    expect(openCalls(replay(games(1, 6), 3, true))).toEqual(["set-2"]);
  });
});

describe("decided and callTable", () => {
  const snap = replay([...games(1, 6), ...games(2, 6), ...games(1, 6)], 3, true);

  it("knows set and match winners", () => {
    expect([...decided(snap)]).toEqual([
      ["set-1", 1],
      ["set-2", 2],
      ["set-3", 1],
      ["match", 1],
    ]);
  });

  it("scores each member's calls", () => {
    const t = callTable(
      [
        { user_id: "u1", call_key: "match", side: 1 },
        { user_id: "u1", call_key: "set-2", side: 1 },
        { user_id: "u2", call_key: "set-2", side: 2 },
      ],
      snap,
    );
    expect(t.get("u1")).toEqual({ right: 1, settled: 2 });
    expect(t.get("u2")).toEqual({ right: 1, settled: 1 });
  });
});

describe("momentum", () => {
  it("starts at the pre-match chance and ends at 1 for the winner", () => {
    const model = roomModel(0.6, 3, "atp");
    const line = momentum([...games(1, 6), ...games(1, 6)], model, true);
    expect(line[0]).toBeCloseTo(0.6, 2);
    expect(line.at(-1)).toBe(1);
    expect(line).toHaveLength(48 + 1);
  });
});
