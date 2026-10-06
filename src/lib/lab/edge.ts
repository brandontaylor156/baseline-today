// A rivalry's edge over time (pure, unit tested): A's chance against B each week, from both
// players' ratings carried forward to that week.

import { calibrate, winProbability, type Rating } from "@/lib/model/elo";

export interface WeekRating {
  week: string;
  overall: number;
  hard: number;
  clay: number;
  grass: number;
}

const toRating = (w: WeekRating): Rating => ({ overall: w.overall, surface: { hard: w.hard, clay: w.clay, grass: w.grass }, matches: 99, surfaceMatches: { hard: 99, clay: 99, grass: 99 } });

/** A's overall chance against B for every week either played, once both have a rating. */
export function edgeOverTime(a: WeekRating[], b: WeekRating[], calibration = 1): { week: string; p: number }[] {
  const weeks = [...new Set([...a, ...b].map((w) => w.week))].sort();
  const out: { week: string; p: number }[] = [];
  let ia = -1;
  let ib = -1;
  for (const week of weeks) {
    while (ia + 1 < a.length && a[ia + 1].week <= week) ia++;
    while (ib + 1 < b.length && b[ib + 1].week <= week) ib++;
    if (ia < 0 || ib < 0) continue;
    out.push({ week, p: calibrate(winProbability(toRating(a[ia]), toRating(b[ib]), null), calibration) });
  }
  return out;
}
