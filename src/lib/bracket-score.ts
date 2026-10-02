// Bracket Challenge scoring (pure, unit tested). Each pick is a winner for one slot (round and
// block of the draw). A correct pick in round r earns 10 × 2^(r−1), so every round is worth the
// same in total. Two picks for the same slot cancel each other out.
import { drawChances, type DrawModel } from "@/lib/draw-model";
import { meetingRound, type PlayedResult } from "@/lib/title-odds";

export const pointsForRound = (r: number) => 10 * 2 ** (r - 1);

export function scoreBracket(model: DrawModel, picks: PlayedResult[]): { score: number; max: number; correct: number } {
  const pos = new Map(model.players.map((p) => [p.key, p.position]));
  const real = drawChances(model);
  const at: (string | null)[] = Array.from({ length: model.size }, () => null);
  for (const p of model.players) if (p.position < model.size) at[p.position] = p.key;

  const slots = new Map<string, { r: number; block: number; winner: string }[]>();
  for (const pick of picks) {
    const a = pos.get(pick.winner);
    const b = pos.get(pick.loser);
    if (a === undefined || b === undefined || a === b) continue;
    const r = meetingRound(a, b);
    const block = Math.floor(a / 2 ** r);
    const id = `${r}|${block}`;
    slots.set(id, [...(slots.get(id) ?? []), { r, block, winner: pick.winner }]);
  }

  let score = 0;
  let possible = 0;
  let correct = 0;
  for (const list of slots.values()) {
    if (list.length !== 1) continue;
    const { r, block, winner } = list[0];
    const size = 2 ** r;
    const members = at.slice(block * size, block * size + size).filter((k): k is string => k !== null);
    const decided = members.find((k) => (real.get(k)?.[r] ?? 0) >= 0.9999);
    if (decided !== undefined) {
      if (decided === winner) {
        score += pointsForRound(r);
        correct++;
      }
    } else if ((real.get(winner)?.[r] ?? 0) > 0) {
      possible += pointsForRound(r);
    }
  }
  return { score, max: score + possible, correct };
}
