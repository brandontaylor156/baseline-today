import "server-only";

import { cache } from "react";

import { ageOn, normalizeHand, pickAnswer, PUZZLE_START, tourForDay, type PuzzlePlayer } from "@/lib/puzzle";
import { createPublicClient } from "@/lib/supabase/public";

import { getRankingDates, getRankings } from "./tennis";

const today = () => new Date().toISOString().slice(0, 10);

/** A playable day: from the first puzzle up to today (UTC). */
export const validDay = (day: string | null): day is string => Boolean(day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= PUZZLE_START && day <= today());

/** The ranking snapshot a day uses: the latest one before that day, so a puzzle never changes mid-day. */
async function rankingsFor(tour: "atp" | "wta", day: string) {
  const date = (await getRankingDates(tour)).find((d) => d < day);
  return date ? getRankings(tour, date) : [];
}

async function profiles(ids: number[]) {
  const { data } = await createPublicClient().from("players").select("id, full_name, tour, country_code, birth_date, plays, height_cm").in("id", ids.length ? ids : [-1]);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/** The answer: one of the day's tour top 100 with a known country. */
export const getPuzzleAnswer = cache(async (day: string): Promise<PuzzlePlayer | null> => {
  const tour = tourForDay(day);
  const ranks = await rankingsFor(tour, day);
  const rows = await profiles(ranks.map((r) => r.player.id));
  const pool = ranks.filter((r) => rows.get(r.player.id)?.country_code).map((r) => ({ id: r.player.id, rank: r.rank }));
  const pick = pickAnswer(day, pool);
  if (!pick) return null;
  const p = rows.get(pick.id)!;
  return { id: p.id, name: p.full_name, tour, country: p.country_code, age: ageOn(p.birth_date, day), rank: pick.rank, heightCm: p.height_cm, hand: normalizeHand(p.plays) };
});

/** A guessed player as of the puzzle day (rank from the same snapshot; null outside the top 100). */
export async function getGuessPlayer(id: number, day: string): Promise<PuzzlePlayer | null> {
  const p = (await profiles([id])).get(id);
  if (!p || (p.tour !== "atp" && p.tour !== "wta")) return null;
  const rank = (await rankingsFor(p.tour, day)).find((r) => r.player.id === id)?.rank ?? null;
  return { id: p.id, name: p.full_name, tour: p.tour, country: p.country_code, age: ageOn(p.birth_date, day), rank, heightCm: p.height_cm, hand: normalizeHand(p.plays) };
}
