import { describe, expect, it } from "vitest";

import { meetingRound, titleOdds } from "./title-odds";

const entries = (keys: (string | null)[]) => keys.flatMap((key, position) => (key ? [{ key, position }] : []));
const even = () => 0.5;
const title = (odds: Map<string, number[]>, k: string) => odds.get(k)!.at(-1)!;

describe("meetingRound", () => {
  it("finds the round two places meet", () => {
    expect(meetingRound(0, 1)).toBe(1);
    expect(meetingRound(1, 2)).toBe(2);
    expect(meetingRound(3, 4)).toBe(3);
  });
});

describe("titleOdds", () => {
  it("splits evenly between equal players, summing to one", () => {
    const odds = titleOdds(8, entries(["a", "b", "c", "d", "e", "f", "g", "h"]), [], even);
    for (const k of "abcdefgh") expect(title(odds, k)).toBeCloseTo(1 / 8);
    expect([...odds.values()].reduce((s, r) => s + r.at(-1)!, 0)).toBeCloseTo(1);
  });

  it("matches a hand calculation with uneven players", () => {
    // a beats anyone 80%; others are even with each other.
    const p = (x: string, y: string) => (x === "a" ? 0.8 : y === "a" ? 0.2 : 0.5);
    const odds = titleOdds(4, entries(["a", "b", "c", "d"]), [], p);
    expect(title(odds, "a")).toBeCloseTo(0.8 * 0.8);
    expect(title(odds, "b")).toBeCloseTo(0.2 * 0.5);
    expect(title(odds, "c")).toBeCloseTo(0.5 * (0.8 * 0.2 + 0.2 * 0.5));
  });

  it("uses played results and byes", () => {
    // 8-place draw; "a" has a bye (place 1 empty); "c" beat "d"; "e" beat "f".
    const odds = titleOdds(8, entries(["a", null, "c", "d", "e", "f", "g", "h"]), [
      { winner: "c", loser: "d" },
      { winner: "e", loser: "f" },
    ], even);
    expect(odds.get("a")![1]).toBe(1);
    expect(title(odds, "d")).toBe(0);
    expect(odds.get("c")![1]).toBe(1);
    expect([...odds.values()].reduce((s, r) => s + r.at(-1)!, 0)).toBeCloseTo(1);
  });

  it("trusts a later result even when an earlier one is missing", () => {
    // The semifinal a–c is known, but neither first-round result is.
    const odds = titleOdds(4, entries(["a", "b", "c", "d"]), [{ winner: "a", loser: "c" }], even);
    expect(odds.get("a")![2]).toBe(1);
    expect(title(odds, "b")).toBe(0);
    expect(title(odds, "d")).toBe(0);
  });
});
