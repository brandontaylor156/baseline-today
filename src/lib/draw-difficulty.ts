// How hard each player's path through the draw is (pure, unit tested): for every round, the
// average rating of the opponent they'd face if they keep winning, weighted by who is likely to
// come through the other half of their block. Measured on the draw at the start (no results).
import { drawChances, type DrawModel } from "@/lib/draw-model";
import { SURFACE_WEIGHT } from "@/lib/model/elo";

export interface PathDifficulty {
  key: string;
  /** Expected opponent rating per round, first round first (null for a bye). */
  byRound: (number | null)[];
  /** Average over the rounds with an opponent. */
  average: number;
}

export function pathDifficulty(model: DrawModel): Map<string, PathDifficulty> {
  const start = { ...model, played: [] };
  const reach = drawChances(start);
  const rating = new Map(
    model.players.map((p) => {
      const r = p.rating;
      const value = !r ? 1500 : model.surface ? (1 - SURFACE_WEIGHT) * r.overall + SURFACE_WEIGHT * r.surface[model.surface] : r.overall;
      return [p.key, value];
    }),
  );
  const at: (string | null)[] = Array.from({ length: model.size }, () => null);
  for (const p of model.players) if (p.position < model.size) at[p.position] = p.key;

  const out = new Map<string, PathDifficulty>();
  for (const p of model.players) {
    const byRound: (number | null)[] = [];
    for (let r = 1; r <= model.rounds; r++) {
      const half = 2 ** (r - 1);
      const block = Math.floor(p.position / (2 * half));
      const mineFirst = Math.floor(p.position / half) % 2 === 0;
      const from = block * 2 * half + (mineFirst ? half : 0);
      const opponents = at.slice(from, from + half).filter((k): k is string => k !== null);
      const weights = opponents.map((k) => reach.get(k)?.[r - 1] ?? 0);
      const total = weights.reduce((s, w) => s + w, 0);
      byRound.push(total === 0 ? null : opponents.reduce((s, k, i) => s + weights[i] * rating.get(k)!, 0) / total);
    }
    const faced = byRound.filter((x): x is number => x !== null);
    out.set(p.key, { key: p.key, byRound, average: faced.length ? faced.reduce((s, x) => s + x, 0) / faced.length : 0 });
  }
  return out;
}
