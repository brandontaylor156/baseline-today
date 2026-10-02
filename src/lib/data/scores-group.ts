// Pure grouping and ordering for the scores page (unit tested).

import type { MatchStatus, SetScore, Tour } from "@/lib/provider/types";

export interface ScoreSide {
  id: number;
  name: string;
  countryCode: string | null;
}

export interface ScoreMatch {
  id: number;
  tour: Tour;
  tournament: { id: number; name: string; category: string | null };
  round: string | null;
  status: MatchStatus;
  resultDetail: string | null;
  isLive: boolean;
  sets: SetScore[];
  p1Game: string | null;
  p2Game: string | null;
  server: string | null;
  scheduledAt: string | null;
  notBefore: string | null;
  player1: ScoreSide | null;
  player2: ScoreSide | null;
  winner: 1 | 2 | null;
}

export interface TournamentGroup {
  id: number;
  name: string;
  category: string | null;
  tour: Tour;
  live: number;
  matches: ScoreMatch[];
}

/** Live first, then other in-progress/suspended, upcoming by time, finished last (latest first). */
function rank(m: ScoreMatch): number {
  if (m.isLive) return 0;
  if (m.status === "in_progress" || m.status === "suspended" || m.status === "delayed") return 1;
  if (m.status === "scheduled" || m.status === "unknown" || m.status === "postponed") return 2;
  return 3;
}

const time = (m: ScoreMatch) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Number.MAX_SAFE_INTEGER);

export function sortMatches(matches: ScoreMatch[]): ScoreMatch[] {
  return [...matches].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return rank(a) === 3 ? time(b) - time(a) : time(a) - time(b);
  });
}

/** Groups by tournament; tournaments with live matches first, then by category weight and name. */
export function groupMatches(matches: ScoreMatch[]): TournamentGroup[] {
  const groups = new Map<number, TournamentGroup>();
  for (const m of matches) {
    const g = groups.get(m.tournament.id) ?? {
      id: m.tournament.id,
      name: m.tournament.name,
      category: m.tournament.category,
      tour: m.tour,
      live: 0,
      matches: [],
    };
    g.matches.push(m);
    if (m.isLive) g.live++;
    groups.set(m.tournament.id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, matches: sortMatches(g.matches) }))
    .sort((a, b) => b.live - a.live || weight(b.category) - weight(a.category) || a.name.localeCompare(b.name));
}

function weight(category: string | null): number {
  const c = (category ?? "").toLowerCase();
  if (c.includes("grand slam")) return 5;
  if (c.includes("1000")) return 4;
  if (c.includes("500")) return 3;
  if (c.includes("250")) return 2;
  if (c.includes("125")) return 1;
  return 0;
}

/** Short status label for a match card. */
export function statusLabel(m: Pick<ScoreMatch, "isLive" | "status" | "resultDetail">): string {
  if (m.isLive) return "Live";
  switch (m.status) {
    case "final":
      return m.resultDetail === "walkover" ? "Walkover" : m.resultDetail === "retired" ? "Retired" : "Final";
    case "in_progress":
      return "In progress";
    case "suspended":
      return "Suspended";
    case "delayed":
      return "Delayed";
    case "postponed":
      return "Postponed";
    case "canceled":
      return "Canceled";
    case "abandoned":
      return "Abandoned";
    default:
      return "Scheduled";
  }
}

/** Whether a page visit should schedule a background refresh. */
export function isStale(refreshedAt: string | null, anyLive: boolean, now: Date, liveSeconds: number, idleSeconds: number) {
  if (!refreshedAt) return true;
  const age = (now.getTime() - Date.parse(refreshedAt)) / 1000;
  return age > (anyLive ? liveSeconds : idleSeconds);
}
