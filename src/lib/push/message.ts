import type { SetScore } from "@/lib/provider/types";

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification opens. */
  url: string;
  /** Replaces an earlier notification about the same match. */
  tag: string;
}

export interface NotifyMatch {
  id: number;
  round: string | null;
  resultDetail: string | null;
  sets: SetScore[];
  winner: 1 | 2;
  tournament: string;
  p1: { id: number | null; name: string };
  p2: { id: number | null; name: string };
}

/** Sets from the winner's side, e.g. "6-4 7-6(5)"; a tiebreak shows the points of its loser. */
export function winnerScore(sets: SetScore[], winner: 1 | 2): string {
  return sets
    .filter((s) => s.p1 !== null && s.p2 !== null)
    .map((s) => {
      const [w, l] = winner === 1 ? [s.p1!, s.p2!] : [s.p2!, s.p1!];
      const tbs = [s.p1Tiebreak, s.p2Tiebreak].filter((n): n is number => n !== null);
      const tiebreak = Math.abs(w - l) === 1 && Math.min(w, l) >= 6 && tbs.length ? `(${Math.min(...tbs)})` : "";
      return `${w}-${l}${tiebreak}`;
    })
    .join(" ");
}

function titleCase(name: string): string {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'(-])\p{L}/gu, (c) => c.toUpperCase()) : name;
}

/** The notification a fan of `fanOf` (a player id) gets for a finished match. */
export function resultMessage(m: NotifyMatch, fanOf: number): PushPayload {
  const winner = m.winner === 1 ? m.p1 : m.p2;
  const loser = m.winner === 1 ? m.p2 : m.p1;
  // Fans of both players hear about the winner.
  const won = winner.id === fanOf || loser.id !== fanOf;
  const subject = won ? winner : loser;
  const opponent = won ? loser : winner;

  const score =
    m.resultDetail === "walkover" ? "by walkover" : `${winnerScore(m.sets, m.winner)}${m.resultDetail === "retired" ? " ret." : ""}`.trim();
  const where = [titleCase(m.tournament), m.round].filter(Boolean).join(", ");
  return {
    title: `${subject.name} ${won ? "won" : "lost"}`,
    body: `${won ? "Beat" : "Lost to"} ${opponent.name}${score ? ` ${score}` : ""} · ${where}`,
    url: subject.id !== null ? `/players/${subject.id}` : "/results",
    tag: `match-${m.id}`,
  };
}
