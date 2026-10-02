// A tournament's draw with everything needed to compute title chances, in the server or the
// browser (pure; the "what if" explorer reruns it on every click).
import { calibrate, newRating, winProbability, type Rating, type Surface } from "@/lib/model/elo";
import { titleOdds, type PlayedResult } from "@/lib/title-odds";

export interface DrawPlayer {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  seed: string | null;
  position: number;
  rating: Rating | null;
}

export interface DrawModel {
  tournamentId: number;
  size: number;
  rounds: number;
  surface: Surface | null;
  calibration: number;
  players: DrawPlayer[];
  played: PlayedResult[];
}

export interface TitleChance {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  seed: string | null;
  /** Chance of winning at least r matches from here, r = 0…rounds. */
  reach: number[];
  title: number;
}

export interface TitleOdds {
  rounds: number;
  /** Players still in the draw, most likely champion first. */
  players: TitleChance[];
}

export function winChance(model: DrawModel): (a: string, b: string) => number {
  const ratings = new Map(model.players.map((p) => [p.key, p.rating ?? newRating()]));
  const cache = new Map<string, number>();
  return (a, b) => {
    const k = `${a}|${b}`;
    let p = cache.get(k);
    if (p === undefined) {
      p = calibrate(winProbability(ratings.get(a) ?? newRating(), ratings.get(b) ?? newRating(), model.surface), model.calibration);
      cache.set(k, p);
    }
    return p;
  };
}

/** Every player's chances; `extra` adds hypothetical results ("what if"). */
export function drawChances(model: DrawModel, extra: PlayedResult[] = []): Map<string, number[]> {
  return titleOdds(
    model.size,
    model.players.map((p) => ({ key: p.key, position: p.position })),
    [...model.played, ...extra],
    winChance(model),
  );
}

export function roundName(r: number, rounds: number): string {
  const fromEnd = rounds - r;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round of ${2 ** (fromEnd + 1)}`;
}

export interface BracketSlot {
  /** The player known to be here (really, or in the "what if" scenario). */
  key: string | null;
  /** When nobody is known yet: the likeliest player and their chance to get here. */
  likely: { key: string; p: number } | null;
  bye: boolean;
}

export interface BracketMatch {
  round: number;
  index: number;
  slots: [BracketSlot, BracketSlot];
  /** Winner, really or in the scenario. */
  winner: string | null;
  /** Decided by a real result (can't be changed in "what if"). */
  real: boolean;
}

/**
 * The bracket as rounds of matches, with who is in each slot given the real results plus the
 * scenario's picks. `reach` is drawChances(model, extra); `realReach` is drawChances(model).
 */
export function bracketRounds(model: DrawModel, reach: Map<string, number[]>, realReach: Map<string, number[]>): BracketMatch[][] {
  const at: (string | null)[] = Array.from({ length: model.size }, () => null);
  for (const p of model.players) if (p.position < model.size) at[p.position] = p.key;
  const occupants = (from: number, to: number) => at.slice(from, to).filter((k): k is string => k !== null);
  const known = (keys: string[], r: number, by: Map<string, number[]>) => keys.find((k) => (by.get(k)?.[r] ?? 0) >= 0.9999) ?? null;

  const out: BracketMatch[][] = [];
  for (let r = 1; r <= model.rounds; r++) {
    const block = 2 ** r;
    const half = block / 2;
    const matches: BracketMatch[] = [];
    for (let start = 0, i = 0; start < model.size; start += block, i++) {
      const slot = (from: number): BracketSlot => {
        const keys = occupants(from, from + half);
        if (keys.length === 0) return { key: null, likely: null, bye: true };
        const key = known(keys, r - 1, reach);
        if (key) return { key, likely: null, bye: false };
        const best = keys.reduce((a, b) => ((reach.get(b)?.[r - 1] ?? 0) > (reach.get(a)?.[r - 1] ?? 0) ? b : a));
        return { key: null, likely: { key: best, p: reach.get(best)?.[r - 1] ?? 0 }, bye: false };
      };
      const all = occupants(start, start + block);
      matches.push({
        round: r,
        index: i,
        slots: [slot(start), slot(start + half)],
        winner: known(all, r, reach),
        real: known(all, r, realReach) !== null,
      });
    }
    out.push(matches);
  }
  return out;
}

/** Players still in contention, most likely champion first (null once decided). */
export function titleChances(model: DrawModel, extra: PlayedResult[] = []): TitleOdds | null {
  const reach = drawChances(model, extra);
  const players = model.players
    .map((p): TitleChance => {
      const r = reach.get(p.key) ?? [];
      return { key: p.key, id: p.id, name: p.name, countryCode: p.countryCode, seed: p.seed, reach: r, title: r.at(-1) ?? 0 };
    })
    .filter((p) => p.title > 0)
    .sort((a, b) => b.title - a.title || a.name.localeCompare(b.name));
  return players.length < 2 ? null : { rounds: model.rounds, players };
}
