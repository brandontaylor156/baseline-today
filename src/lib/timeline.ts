// A player's season, one row per tournament (pure, unit tested).
import type { SeasonMatch } from "@/lib/leaders";

export interface TimelineRow {
  tournamentId: number;
  name: string;
  date: string;
  surface: string | null;
  w: number;
  l: number;
  /** Round of the player's last tracked match there. */
  reached: string | null;
  champion: boolean;
  /** Who ended the run (null for a title, or while still in the draw). */
  lostTo: { id: number | null; name: string } | null;
}

const isFinal = (round: string | null) => /^finals?$/i.test(round ?? "");

export function seasonTimeline(matches: SeasonMatch[], playerId: number): TimelineRow[] {
  const by = new Map<number, SeasonMatch[]>();
  for (const m of matches) {
    if (m.p1.id !== playerId && m.p2.id !== playerId) continue;
    by.set(m.tournamentId, [...(by.get(m.tournamentId) ?? []), m]);
  }
  return [...by.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.roundRank - b.roundRank);
      const last = sorted.at(-1)!;
      const sideOf = (m: SeasonMatch) => (m.p1.id === playerId ? 1 : 2);
      // Walkovers count neither way, like the season record.
      const played = sorted.filter((m) => !m.walkover);
      const w = played.filter((m) => m.winner === sideOf(m)).length;
      const lostLast = last.winner !== sideOf(last);
      const opponent = sideOf(last) === 1 ? last.p2 : last.p1;
      return {
        tournamentId: last.tournamentId,
        name: last.tournamentName,
        date: last.date,
        surface: last.surface,
        w,
        l: played.length - w,
        reached: last.round,
        champion: !lostLast && isFinal(last.round),
        lostTo: lostLast ? { id: opponent.id, name: opponent.name } : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}
