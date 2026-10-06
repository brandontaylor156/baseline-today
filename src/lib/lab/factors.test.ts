import { describe, expect, it } from "vitest";

import { rng } from "./forecast";
import { asRating, factorRows, fitLogistic, logLoss, type FactorMatch, type FactorRow } from "./factors";

describe("factorRows", () => {
  const m = (over: Partial<FactorMatch>): FactorMatch => ({
    key1: "a",
    key2: "b",
    winner: 1,
    p1: 0.5,
    tournamentId: 1,
    startDate: "2024-01-01",
    surface: "Hard",
    round: 1,
    country1: null,
    country2: null,
    host: null,
    bestOf: 3,
    sets: [
      [6, 4],
      [3, 6],
      [6, 3],
    ],
    walkover: false,
    ...over,
  });

  it("measures load, a long last match, home soil and a new surface before each match", () => {
    const rows = factorRows([
      m({ key2: "c", country1: "FRA", host: "FRA" }),
      m({ key2: "d", round: 2, country1: "FRA", host: "FRA", sets: [[6, 0], [6, 0]] }),
      // Next week, on clay, after a semifinal-or-better run? Only two matches, so no.
      m({ key2: "e", tournamentId: 2, startDate: "2024-01-08", surface: "Clay" }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].x).toEqual([0, 0, 0, 0, 0, 1, 0]); // both new to the record
    // Round 2: 28 games played and a three-setter for a; d is fresh.
    expect(rows[1].x).toEqual([2.8, 1, 0, 0, 0, 1, 0]);
    expect(rows[2].x).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("skips walkovers but still counts the event as played", () => {
    expect(factorRows([m({ walkover: true, sets: [] })])).toHaveLength(0);
  });
});

describe("fitLogistic", () => {
  it("recovers a hidden home edge on top of a calibrated model", () => {
    const rand = rng(11);
    const rows: FactorRow[] = [];
    for (let i = 0; i < 20000; i++) {
      const elo = (rand() - 0.5) * 600;
      const home = rand() < 0.2 ? (rand() < 0.5 ? 1 : -1) : 0;
      const p = 1 / (1 + 10 ** (-elo / 400));
      const truth = 1 / (1 + 10 ** (-(elo + 60 * home) / 400));
      rows.push({ logit: Math.log(p / (1 - p)), x: [0, 0, 0, 0, 0, home, 0], y: rand() < truth ? 1 : 0, date: "2024-01-01" });
    }
    const all = fitLogistic(rows);
    expect(all.beta[0]).toBeCloseTo(1, 1);
    expect(asRating(all.beta[6])).toBeGreaterThan(30);
    expect(asRating(all.beta[6])).toBeLessThan(90);
    expect(all.se[6]).toBeGreaterThan(0);
    const off = [true, true, true, true, true, false, true];
    expect(logLoss(rows, all)).toBeLessThan(logLoss(rows, fitLogistic(rows, off), off));
  });
});
