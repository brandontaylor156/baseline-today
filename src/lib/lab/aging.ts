// Aging-curve projections (pure, unit tested): move a player's rating along the tour's average
// curve, and say where that rating would sit in today's field.

export interface CurvePoint {
  age: number;
  mean: number;
}

/** The curve's value at an age, interpolating between whole years and holding at the ends. */
export function curveAt(curve: CurvePoint[], age: number): number | null {
  if (curve.length === 0) return null;
  const sorted = [...curve].sort((a, b) => a.age - b.age);
  if (age <= sorted[0].age) return sorted[0].mean;
  if (age >= sorted.at(-1)!.age) return sorted.at(-1)!.mean;
  const i = sorted.findIndex((p) => p.age >= age);
  const a = sorted[i - 1];
  const b = sorted[i];
  return a.mean + ((b.mean - a.mean) * (age - a.age)) / (b.age - a.age);
}

/** The age the average player peaks. */
export const peakAge = (curve: CurvePoint[]) => curve.reduce((b, p) => (p.mean > b.mean ? p : b), curve[0])?.age ?? null;

/** Rating in `years`, following the average change between those ages on the curve. */
export function project(rating: number, age: number, years: number, curve: CurvePoint[]): number | null {
  const now = curveAt(curve, age);
  const then = curveAt(curve, age + years);
  return now === null || then === null ? null : rating + (then - now);
}

/** Where a rating would rank among today's ratings (1 = best). */
export const rankAmong = (rating: number, field: number[]) => 1 + field.filter((r) => r > rating).length;
