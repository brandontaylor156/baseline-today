import "server-only";

import { cache } from "react";

import { drawChances } from "@/lib/draw-model";
import { countsForRace } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";
import { raceTable, roundsFor, type LiveDraw, type RaceEvent, type RaceRow } from "@/lib/race";
import { qualifyChances } from "@/lib/race-sim";

import { getSeasonMatches } from "./season";
import { getDrawModel } from "./title-odds";
import { getSeasonTournaments } from "./tournaments";

const WEEK = 7 * 86400000;

/** The season race for a tour: points from tracked results, projections and Finals chances. */
export const getRace = cache(async (tour: Tour, season: number): Promise<{ rows: RaceRow[]; live: number; events: number; qualify: Map<string, number> | null; weeksLeft: number }> => {
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
  const rows = raceTable(matches, events, live);

  // Weeks before the Finals (from our calendar), and since the first event.
  const finals = tournaments.find((t) => t.tour === tour && /finals/i.test(t.category ?? ""));
  const cutoff = Date.parse(`${finals?.startDate ?? `${season}-11-08`}T00:00:00Z`) - WEEK;
  const first = counted.map((t) => t.startDate).filter((d): d is string => Boolean(d)).sort()[0];
  const now = Date.parse(`${today}T00:00:00Z`);
  const weeksLeft = Math.max(0, Math.floor((cutoff - now) / WEEK));
  const weeksSoFar = first ? Math.max(1, (now - Date.parse(`${first}T00:00:00Z`)) / WEEK) : 1;
  const over = finals?.startDate !== undefined && finals.startDate !== null && today >= finals.startDate;
  const qualify = over ? null : qualifyChances({ rows, weeksSoFar, weeksLeft, spots: 8 });
  return { rows, live: live.size, events: counted.length, qualify, weeksLeft };
});
