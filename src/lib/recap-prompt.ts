// Facts and instructions for AI match recaps (pure, unit tested). The model sees only these facts.

export interface RecapFacts {
  tournament: string;
  category: string | null;
  surface: string | null;
  round: string;
  winner: string;
  loser: string;
  /** From the winner's side, e.g. "6-4 3-6 7-6(5)". */
  score: string;
  retired: boolean;
  /** Winner's pre-match chance from our model (0–1), if known. */
  winnerChance: number | null;
  /** Head-to-head before this match, from the winner's side. */
  h2h: { winner: number; loser: number } | null;
}

export const RECAP_SYSTEM = [
  "You write short, neutral match recaps for a tennis statistics website.",
  "Use only the facts provided. Never invent quotes, injuries, crowd details, statistics, rankings, ages or history that are not in the facts.",
  "No betting advice or gambling language. No headings, lists or emojis.",
  "Write 60 to 100 words of plain prose in British-neutral English, past tense.",
].join(" ");

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function recapPrompt(f: RecapFacts): string {
  const lines = [
    `Tournament: ${f.tournament}${f.category ? ` (${f.category})` : ""}${f.surface ? `, ${f.surface.toLowerCase()} court` : ""}`,
    `Round: ${f.round}`,
    `Winner: ${f.winner}`,
    `Loser: ${f.loser}`,
    `Score (winner first): ${f.score}${f.retired ? " (loser retired)" : ""}`,
  ];
  if (f.winnerChance !== null) lines.push(`Our model gave the winner a ${pct(f.winnerChance)} chance before the match${f.winnerChance < 0.4 ? " (an upset)" : ""}.`);
  if (f.h2h && f.h2h.winner + f.h2h.loser > 0) lines.push(`Head-to-head before this match, in tracked draws since 2015: ${f.winner} ${f.h2h.winner}, ${f.loser} ${f.h2h.loser}.`);
  return `Write the recap from these facts only.\n\n${lines.join("\n")}`;
}
