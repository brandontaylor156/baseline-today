import "server-only";

import { cache } from "react";

import { drawChances } from "@/lib/draw-model";
import { countsForRace } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";
import { raceTable, roundsFor, type LiveDraw, type RaceEvent, type RaceRow } from "@/lib/race";

import { getSeasonMatches } from "./season";
import { getDrawModel } from "./title-odds";
import { getSeasonTournaments } from "./tournaments";

/** The season race for a tour: points from tracked results plus projections for events in play. */
export const getRace = cache(async (tour: Tour, season: number): Promise<{ rows: RaceRow[]; live: number; events: number }> => {
  const today = new Date().toISOString().slice(0, 10);
  const [matches, tournaments] = await Promise.all([getSeasonMatches(tour, season), getSeasonTournaments(season)]);
  const counted = tournaments.filter((t) => t.tour === tour && countsForRace(tour, t.category));
  const events = new Map<number, RaceEvent>(counted.map((t) => [t.id, { tour, category: t.category, rounds: roundsFor(t.drawSize) }]));

  const inPlay = counted.filter((t) => !t.champion && t.startDate && t.startDate <= today && (t.endDate ?? today) >= today);
  const live = new Map<number, LiveDraw>();
  for (const t of inPlay) {
    const model = await getDrawModel(t.id);
    if (!model) continue;
    // The bracket is the authority on the number of rounds once we have it.
    events.set(t.id, { tour, category: t.category, rounds: model.rounds });
    live.set(t.id, { reach: drawChances(model), players: model.players });
  }
  return { rows: raceTable(matches, events, live), live: live.size, events: counted.length };
});
