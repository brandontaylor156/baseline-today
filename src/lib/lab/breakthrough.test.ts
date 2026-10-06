import { describe, expect, it } from "vitest";

import { auc, brier, fitModel, predict, type Example } from "./breakthrough";
import { rng } from "./forecast";

describe("breakthrough model", () => {
  it("learns a real signal and scores it", () => {
    const rand = rng(9);
    const make = (n: number): Example[] =>
      Array.from({ length: n }, () => {
        const rating = 1500 + rand() * 400;
        const noise = rand();
        const p = 1 / (1 + Math.exp(-((rating - 1700) / 60)));
        return { features: [rating, noise], y: rand() < p ? 1 : 0 };
      });
    const model = fitModel(make(3000));
    expect(model.beta[1]).toBeGreaterThan(1); // rating matters
    expect(Math.abs(model.beta[2])).toBeLessThan(0.2); // noise doesn't
    const test = make(1000).map((e) => ({ p: predict(model, e.features), y: e.y }));
    expect(auc(test)).toBeGreaterThan(0.8);
    expect(brier(test)).toBeLessThan(0.2);
  });

  it("scores AUC exactly on a small case", () => {
    expect(auc([{ p: 0.9, y: 1 }, { p: 0.1, y: 0 }])).toBe(1);
    expect(auc([{ p: 0.1, y: 1 }, { p: 0.9, y: 0 }])).toBe(0);
  });
});
