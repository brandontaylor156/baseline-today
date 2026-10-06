// Demo watch party (pure, unit tested): a plausible point-by-point replay of a finished match from
// its set scores, and the bot members' calls and chat. Only the set scores are real; the order of
// games and points is made up, deterministically from a seed.
import { replay, type ScoreSnapshot } from "@/lib/scorekeeper";

export type Side = 1 | 2;

/** Small seeded PRNG (mulberry32), so a replay is the same on the server and in every browser. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Points of one game or tiebreak won by `winner`, ending exactly on its last point. */
function gamePoints(winner: Side, tiebreak: boolean, rand: () => number): Side[] {
  const loser: Side = winner === 1 ? 2 : 1;
  const target = tiebreak ? 7 : 4;
  const r = rand();
  // Mostly clean games; some go to deuce (or 6-all in a tiebreak).
  if (r < (tiebreak ? 0.25 : 0.2)) {
    const pairs = Math.floor(rand() * 3);
    const level = shuffle([...Array(target - 1).fill(winner), ...Array(target - 1).fill(loser)], rand);
    const extra = Array.from({ length: pairs }, () => (rand() < 0.5 ? [winner, loser] : [loser, winner])).flat();
    return [...level, ...extra, winner, winner];
  }
  const lost = Math.floor(rand() * (target - 1));
  return [...shuffle([...Array(target - 1).fill(winner), ...Array(lost).fill(loser)], rand), winner];
}

/** Game winners of one set, in an order that never ends the set early. */
function setGames(a: number, b: number, rand: () => number): Side[] {
  const winner: Side = a > b ? 1 : 2;
  const loser: Side = winner === 1 ? 2 : 1;
  const won = Math.max(a, b);
  const lost = Math.min(a, b);
  const valid = (games: Side[]) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < games.length - 1; i++) {
      if (games[i] === 1) x++;
      else y++;
      if ((Math.max(x, y) >= 6 && Math.abs(x - y) >= 2) || Math.max(x, y) === 7) return false;
    }
    return true;
  };
  const body = [...Array(won - 1).fill(winner), ...Array(lost).fill(loser)];
  for (let tries = 0; tries < 20; tries++) {
    const games = [...shuffle(body, rand), winner];
    if (valid(games)) return games;
  }
  // Interleaving the games evenly always works.
  const even: Side[] = [];
  for (let i = 0, w = 0, l = 0; i < body.length; i++) {
    if (l < lost && (w >= won - 1 || l * (won - 1) <= w * lost)) {
      even.push(loser);
      l++;
    } else {
      even.push(winner);
      w++;
    }
  }
  return [...even, winner];
}

/**
 * A point sequence whose replay ends with exactly these set scores, or null when the scores
 * aren't a complete match under our scoring (retirements, unusual formats).
 */
export function pointsForSets(sets: { a: number; b: number }[], bestOf: 3 | 5, seed: number): Side[] | null {
  const rand = rng(seed);
  const points: Side[] = [];
  for (const { a, b } of sets) {
    const games = setGames(a, b, rand);
    games.forEach((g, i) => points.push(...gamePoints(g, i === 12, rand)));
  }
  const end = replay(points, bestOf, true);
  const same = end.winner !== null && end.sets.length === sets.length && end.sets.every((s, i) => s.a === sets[i].a && s.b === sets[i].b);
  return same ? points : null;
}

export type BotEvent = { kind: "start" } | { kind: "break"; side: Side } | { kind: "tiebreak" } | { kind: "set"; side: Side; set: number } | { kind: "match"; side: Side };

/** What happened on the last point, for the bots to react to. */
export function eventAt(points: Side[], i: number, bestOf: 3 | 5): BotEvent | null {
  if (i === 0) return { kind: "start" };
  const before = replay(points.slice(0, i - 1), bestOf, true);
  const after = replay(points.slice(0, i), bestOf, true);
  if (after.winner) return { kind: "match", side: after.winner };
  if (after.setsA + after.setsB > before.setsA + before.setsB) return { kind: "set", side: after.setsA > before.setsA ? 1 : 2, set: after.setsA + after.setsB };
  if (after.tiebreak && !before.tiebreak) return { kind: "tiebreak" };
  const gamesBefore = gameCount(before);
  const gamesAfter = gameCount(after);
  if (gamesAfter > gamesBefore && !before.tiebreak) {
    const wonA = after.sets.at(-1)!.a > before.sets.at(-1)!.a;
    // The server was before.serverA; winning while receiving is a break.
    if (wonA !== before.serverA) return { kind: "break", side: wonA ? 1 : 2 };
  }
  return null;
}

function gameCount(s: ScoreSnapshot): number {
  return s.sets.reduce((n, set) => n + set.a + set.b, 0);
}

export const BOTS = [
  { id: "bot-ana", nickname: "Ana" },
  { id: "bot-marco", nickname: "Marco" },
  { id: "bot-priya", nickname: "Priya" },
] as const;

/** Each bot's call: Ana backs the favorite, Marco the underdog, Priya flips a coin. */
export function botCall(bot: number, key: string, chanceA: number, seed: number): Side {
  if (bot === 0) return chanceA >= 0.5 ? 1 : 2;
  if (bot === 1) return chanceA >= 0.5 ? 2 : 1;
  const r = rng(seed + key.length * 7919 + key.charCodeAt(key.length - 1))();
  return r < 0.5 ? 1 : 2;
}

/** A bot's chat line for an event, or null to stay quiet. Names are last names. */
export function botLine(event: BotEvent, names: [string, string], pick: number): { bot: number; text: string; emoji?: string } | null {
  const n = (s: Side) => names[s - 1];
  const bot = pick % BOTS.length;
  switch (event.kind) {
    case "start":
      return { bot: 0, text: "Here we go! 🎾" };
    case "break":
      return [
        { bot, text: `Break! ${n(event.side)} gets it`, emoji: "😱" },
        { bot, text: `${n(event.side)} breaks, game on`, emoji: "🔥" },
        { bot, text: `That's a break for ${n(event.side)}`, emoji: "😬" },
      ][pick % 3];
    case "tiebreak":
      return { bot, text: "Tiebreak time 😬", emoji: "😬" };
    case "set":
      return { bot, text: `Set ${event.set} to ${n(event.side)}`, emoji: "👏" };
    case "match":
      return { bot: (bot + 1) % BOTS.length, text: `Game, set, match ${n(event.side)}! What a watch`, emoji: "🙌" };
  }
}
