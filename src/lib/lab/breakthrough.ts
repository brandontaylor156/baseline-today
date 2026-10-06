// The breakthrough forecaster's pieces (pure, unit tested): feature scaling, a logistic model with
// an intercept, and the scores that say whether it works (AUC, Brier).

import { fitLogistic, type FactorRow } from "./factors";

export interface Example {
  features: number[];
  /** 1 if the player broke through (the outcome window is fully in the past). */
  y: 0 | 1;
}

export interface Scaler {
  mean: number[];
  sd: number[];
}

export function fitScaler(xs: number[][]): Scaler {
  const k = xs[0]?.length ?? 0;
  const mean = Array.from({ length: k }, (_, j) => xs.reduce((s, x) => s + x[j], 0) / Math.max(1, xs.length));
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(xs.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / Math.max(1, xs.length)) || 1);
  return { mean, sd };
}

const scale = (x: number[], s: Scaler) => x.map((v, j) => (v - s.mean[j]) / s.sd[j]);

export interface Model {
  scaler: Scaler;
  beta: number[];
}

/** Logistic regression with an intercept on standardized features. */
export function fitModel(examples: Example[]): Model {
  const scaler = fitScaler(examples.map((e) => e.features));
  // fitLogistic's first column is a fixed "logit"; here it carries the intercept.
  const rows: FactorRow[] = examples.map((e) => ({ logit: 1, x: scale(e.features, scaler), y: e.y, date: "" }));
  const fit = fitLogistic(rows, examples[0]?.features.map(() => true) ?? []);
  return { scaler, beta: fit.beta };
}

export function predict(model: Model, features: number[]): number {
  const x = scale(features, model.scaler);
  const z = model.beta[0] + x.reduce((s, v, j) => s + v * model.beta[j + 1], 0);
  return 1 / (1 + Math.exp(-z));
}

/** Area under the ROC curve: the chance a random breakthrough was ranked above a random non-breakthrough. */
export function auc(scored: { p: number; y: 0 | 1 }[]): number {
  const pos = scored.filter((s) => s.y === 1);
  const neg = scored.filter((s) => s.y === 0);
  if (!pos.length || !neg.length) return 0.5;
  const sorted = [...scored].sort((a, b) => a.p - b.p);
  let rankSum = 0;
  sorted.forEach((s, i) => {
    if (s.y === 1) rankSum += i + 1;
  });
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

export const brier = (scored: { p: number; y: 0 | 1 }[]) => scored.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / Math.max(1, scored.length);
