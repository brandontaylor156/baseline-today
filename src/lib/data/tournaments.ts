import "server-only";

import { cache } from "react";

import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import { roundRank } from "@/lib/wiki/rows";

import { dedupeResults, RESULT_SELECT, titleFromUrl, toResult, type Result, type ResultRow } from "./results";

export interface TournamentSummary {
  id: number;
  tour: Tour;
  name: string;
  category: string | null;
  location: string | null;
  surface: string | null;
  startDate: string | null;
  endDate: string | null;
  drawSize: number | null;
  champion: { id: number | null; name: string } | null;
}

type TournamentRow = {
  id: number;
  tour: string;
  name: string;
  category: string | null;
  location: string | null;
  surface: string | null;
  start_date: string | null;
  end_date: string | null;
  draw_size: number | null;
};

const FINAL = /^final(s)?$/i;

function champion(final: Result | undefined): TournamentSummary["champion"] {
  if (!final || final.winner === null) return null;
  const side = final.winner === 1 ? final.player1 : final.player2;
  return side ? { id: side.id, name: side.name } : null;
}

function summary(t: TournamentRow, final?: Result): TournamentSummary {
  return {
    id: t.id,
    tour: t.tour as Tour,
    name: t.name,
    category: t.category,
    location: t.location,
    surface: t.surface,
    startDate: t.start_date,
    endDate: t.end_date,
    drawSize: t.draw_size,
    champion: champion(final),
  };
}

/** Tour-level tournaments of a season, with champions where the final is known. */
export const getSeasonTournaments = cache(async (season: number): Promise<TournamentSummary[]> => {
  const db = createPublicClient();
  const [{ data: tournaments, error }, { data: finals, error: fErr }] = await Promise.all([
    db
      .from("tournaments")
      .select("id, tour, name, category, location, surface, start_date, end_date, draw_size")
      .eq("provider", "balldontlie")
      .eq("season", season)
      .not("category", "is", null)
      .order("start_date"),
    db.from("matches").select(RESULT_SELECT).eq("status", "final").eq("confirmed", true).eq("season", season).in("round", ["Final", "Finals"]),
  ]);
  if (error) throw new Error(`tournaments: ${error.message}`);
  if (fErr) throw new Error(`finals: ${fErr.message}`);

  const finalBy = new Map<number, Result>();
  for (const r of dedupeResults(((finals ?? []) as unknown as ResultRow[]).map(toResult))) finalBy.set(r.tournament.id, r);
  return (tournaments ?? []).map((t) => summary(t, finalBy.get(t.id)));
});

export interface TournamentDetail extends TournamentSummary {
  rounds: { round: string; matches: Result[] }[];
  sources: { title: string; url: string }[];
}

/** One tournament with its finished matches grouped by round (first round first). */
export const getTournament = cache(async (id: number): Promise<TournamentDetail | null> => {
  const db = createPublicClient();
  const [{ data: t, error }, { data: rows, error: mErr }] = await Promise.all([
    db
      .from("tournaments")
      .select("id, tour, name, category, location, surface, start_date, end_date, draw_size")
      .eq("id", id)
      .maybeSingle(),
    db.from("matches").select(RESULT_SELECT).eq("tournament_id", id).eq("status", "final").eq("confirmed", true).limit(300),
  ]);
  if (error) throw new Error(`tournament: ${error.message}`);
  if (mErr) throw new Error(`tournament matches: ${mErr.message}`);
  if (!t) return null;

  const results = dedupeResults(((rows ?? []) as unknown as ResultRow[]).map(toResult));
  const byRound = new Map<string, Result[]>();
  for (const r of results) {
    const key = r.round ?? "Matches";
    byRound.set(key, [...(byRound.get(key) ?? []), r]);
  }
  const rounds = [...byRound.entries()]
    .sort((a, b) => roundRank(a[0]) - roundRank(b[0]))
    .map(([round, matches]) => ({ round, matches }));
  const sources: { title: string; url: string }[] = [];
  for (const r of results) {
    if (r.provider === "wikipedia" && r.sourceUrl && !sources.some((s) => s.url === r.sourceUrl)) {
      sources.push({ title: titleFromUrl(r.sourceUrl), url: r.sourceUrl });
    }
  }
  return { ...summary(t, results.find((r) => FINAL.test(r.round ?? ""))), rounds, sources };
});

/** Splits a season into this week, upcoming (next 4 weeks) and recently finished (last 4 weeks). */
export function calendarSections(list: TournamentSummary[], today: string) {
  const plusDays = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const soon = plusDays(28);
  const recent = plusDays(-28);
  return {
    now: list.filter((t) => t.startDate && t.endDate && t.startDate <= today && t.endDate >= today),
    upcoming: list.filter((t) => t.startDate && t.startDate > today && t.startDate <= soon),
    finished: list.filter((t) => t.endDate && t.endDate < today && t.endDate >= recent).reverse(),
  };
}

/** "30 Sep – 11 Oct" (same year assumed; season pages are per year). */
export function dateRange(start: string | null, end: string | null): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (!start) return "";
  const s = fmt.format(new Date(`${start}T00:00:00Z`));
  return end && end !== start ? `${s} – ${fmt.format(new Date(`${end}T00:00:00Z`))}` : s;
}

/** Proper-case provider names like "BEIJING" or "JINGSHAN 125". */
export function displayName(name: string): string {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'(-])\p{L}/gu, (c) => c.toUpperCase()) : name;
}
