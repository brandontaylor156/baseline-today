// Daily "Guess the player" (pure, unit tested): which player a day's puzzle is, and how a guess
// compares with the answer. The answer is chosen and compared on the server.

export const PUZZLE_START = "2026-10-06";
export const MAX_GUESSES = 6;

export interface PuzzlePlayer {
  id: number;
  name: string;
  tour: "atp" | "wta";
  country: string | null;
  /** Age in whole years on the puzzle day. */
  age: number | null;
  rank: number | null;
  heightCm: number | null;
  /** "right" | "left" | null */
  hand: string | null;
}

export type Cell = { result: "match" | "close" | "miss" | "unknown"; dir?: "up" | "down" };

export interface Feedback {
  correct: boolean;
  guess: PuzzlePlayer;
  country: Cell;
  age: Cell;
  rank: Cell;
  height: Cell;
  hand: Cell;
}

const DAY = 86_400_000;

/** Puzzle number for a UTC date (1 on the first day). */
export const puzzleNumber = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${PUZZLE_START}T00:00:00Z`)) / DAY) + 1;

/** Tour alternates by day; the player is a stable pseudo-random pick from that tour's pool. */
export function pickAnswer<T extends { id: number }>(day: string, pool: T[]): T | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.id - b.id);
  let h = 2166136261;
  for (const c of `baseline-${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return sorted[h % sorted.length];
}

export const tourForDay = (day: string): "atp" | "wta" => (puzzleNumber(day) % 2 === 1 ? "atp" : "wta");

export function ageOn(birthDate: string | null, day: string): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const d = new Date(`${day}T00:00:00Z`);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function normalizeHand(plays: string | null): string | null {
  if (!plays) return null;
  if (/left/i.test(plays)) return "left";
  if (/right/i.test(plays)) return "right";
  return null;
}

function numeric(guess: number | null, answer: number | null, closeWithin: number, higherIsUp = true): Cell {
  if (guess === null || answer === null) return { result: "unknown" };
  if (guess === answer) return { result: "match" };
  const dir = (answer > guess) === higherIsUp ? "up" : "down";
  return { result: Math.abs(guess - answer) <= closeWithin ? "close" : "miss", dir };
}

/**
 * How a guess compares with the answer. Arrows point toward the answer: for rank, "up" means a
 * better (smaller) rank.
 */
export function compare(guess: PuzzlePlayer, answer: PuzzlePlayer): Feedback {
  const exact = (a: string | null, b: string | null): Cell => (a === null || b === null ? { result: "unknown" } : { result: a === b ? "match" : "miss" });
  return {
    correct: guess.id === answer.id,
    guess,
    country: exact(guess.country, answer.country),
    age: numeric(guess.age, answer.age, 2),
    rank: numeric(guess.rank, answer.rank, 10, false),
    height: numeric(guess.heightCm, answer.heightCm, 5),
    hand: exact(guess.hand, answer.hand),
  };
}

const SQUARE: Record<Cell["result"], string> = { match: "🟩", close: "🟨", miss: "⬛", unknown: "⬜" };

/** Shareable result: one row of squares per guess, spoiler-free. */
export function shareText(day: string, rows: Feedback[], won: boolean): string {
  const lines = rows.map((r) => (r.correct ? "🟩🟩🟩🟩🟩" : [r.country, r.age, r.rank, r.height, r.hand].map((c) => SQUARE[c.result]).join("")));
  return [`Baseline Today Guess the Player #${puzzleNumber(day)} ${won ? rows.length : "X"}/${MAX_GUESSES}`, ...lines].join("\n");
}
