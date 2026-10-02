// Ranks model ratings and compares them with the tour ranking. Pure, for the ratings page.
import { SURFACE_WEIGHT, type Surface } from "@/lib/model/elo";

export type RatingView = "overall" | Surface;
export const RATING_VIEWS: RatingView[] = ["overall", "hard", "clay", "grass"];

export interface RatedPlayer {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  elo: number;
  surface: Record<Surface, number>;
  matches: number;
  surfaceMatches: Record<Surface, number>;
  /** Tour ranking this week (top 100 only). */
  rank: number | null;
}

export interface RatedRow extends RatedPlayer {
  rating: number;
  modelRank: number;
}

/** Minimum history for a place in the table: enough matches for a settled rating. */
export const MIN_MATCHES = 20;
export const MIN_SURFACE_MATCHES = 10;

/** Rating for a view: overall, or overall and surface blended the way predictions blend them. */
export function viewRating(p: RatedPlayer, view: RatingView): number {
  return view === "overall" ? p.elo : (1 - SURFACE_WEIGHT) * p.elo + SURFACE_WEIGHT * p.surface[view];
}

export function rankRatings(players: RatedPlayer[], view: RatingView): RatedRow[] {
  return players
    .filter((p) => p.matches >= MIN_MATCHES && (view === "overall" || p.surfaceMatches[view] >= MIN_SURFACE_MATCHES))
    .map((p) => ({ ...p, rating: viewRating(p, view) }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .map((p, i) => ({ ...p, modelRank: i + 1 }));
}

/**
 * Where the model and the ranking disagree most (overall view). Underrated: in the model's top 30
 * but ranked far lower (or outside the top 100). Overrated: in the ranking's top 30 but rated far lower.
 */
export function disagreements(rows: RatedRow[], limit = 5) {
  const gap = (r: RatedRow) => (r.rank ?? 101) - r.modelRank;
  const underrated = rows
    .filter((r) => r.modelRank <= 30 && gap(r) >= 10)
    .sort((a, b) => gap(b) - gap(a))
    .slice(0, limit);
  const overrated = rows
    .filter((r) => r.rank !== null && r.rank <= 30 && -gap(r) >= 10)
    .sort((a, b) => gap(a) - gap(b))
    .slice(0, limit);
  return { underrated, overrated };
}
