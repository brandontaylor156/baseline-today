import "server-only";

import { getRace } from "@/lib/data/race";
import { getSeasonMatches } from "@/lib/data/season";
import { bestOfFive, calibrate, normalizeSurface, winProbability, type Rating } from "@/lib/model/elo";
import { countsForRace, defaultDrawSize } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";
import { eventPoints, roundsFor, type RaceEvent } from "@/lib/race";
import { FIELD, simulateSeason, type SeasonOutlook, type SimEvent, type SimPlayer } from "@/lib/season-sim";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { latestRevisions } from "@/lib/wiki/client";
import { finalsPoints, finalsQualifiers } from "@/lib/wiki/finals";
import { normalizeName } from "@/lib/wiki/names";

const SIMS = 2000;
// Rest-of-season form spread (rating points). The 2025 backtest scored best with none (tried 0, 40,
// 80, 120), so it is off unless SEASON_FORM_SD sets it.
const FORM_SD = Number(process.env.SEASON_FORM_SD ?? 0);
const POOL = 200;
const DAY = 86_400_000;


type T = { id: number; provider_id: number | null; name: string; category: string | null; surface: string | null; start_date: string | null; end_date: string | null; draw_size: number | null };

export interface SeasonOutlookRow extends SeasonOutlook {
  id: number;
  name: string;
  country: string | null;
  rank: number | null;
  /** Ranking points now (latest ranking plus results since), and last year's points still to come off. */
  points: number;
  dropping: number;
  racePoints: number;
}

export interface SeasonOutlookCache {
  generated: string;
  season: number;
  rankingDate: string;
  sims: number;
  finalsStart: string | null;
  events: { name: string; category: string; week: string }[];
  players: SeasonOutlookRow[];
  backtest?: SeasonBacktest[];
}

export interface SeasonBacktest {
  asOf: string;
  /** The eight who qualified with the chance each was given, and others given 20% or more. */
  qualifiers: { name: string; chance: number }[];
  missed: { name: string; chance: number }[];
  /** Brier score of the qualifying chances (top 30 by race), and of "the current top 8 qualify". */
  brier: number;
  baseline: number;
  no1: { name: string; chance: number } | null;
}

/** The Monday of an event's week; events that start on a Sunday belong to the week after. */
const monday = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`) + (new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? DAY : 0);
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
};

/** Points in last year's season finals, by player key (from Wikipedia). */
async function finalsResults(tour: Tour, season: number, names: Map<string, string>): Promise<Record<string, number>> {
  const title = `${season} ${tour.toUpperCase()} Finals – Singles`;
  const page = (await latestRevisions([title]).catch(() => new Map<string, { content: string }>())).get(title);
  const out: Record<string, number> = {};
  if (!page) return out;
  for (const [name, pts] of finalsPoints(page.content)) {
    const key = names.get(normalizeName(name));
    if (key) out[key] = pts;
  }
  return out;
}

/**
 * Everything the simulator needs as of a date. `live`: today, with events in progress taken
 * from their draws; otherwise a backtest, where only results finished before `asOf` count and
 * events in progress are simulated from the start.
 */
async function buildSeason(db: AdminClient, tour: Tour, asOf: string, live: boolean, calibration: number) {
  const season = Number(asOf.slice(0, 4));
  const { data: tournaments, error: tErr } = await db
    .from("tournaments")
    .select("id, provider_id, name, category, surface, start_date, end_date, draw_size, season")
    .eq("tour", tour)
    .eq("provider", "balldontlie")
    .in("season", [season - 1, season]);
  if (tErr) throw new Error(`season outlook: tournaments: ${tErr.message}`);
  const cur = (tournaments ?? []).filter((t) => t.season === season) as T[];
  const prev = (tournaments ?? []).filter((t) => t.season === season - 1) as T[];
  const finalsT = cur.find((t) => /finals/i.test(t.category ?? "") && !/davis/i.test(t.name));
  if (finalsT?.start_date && asOf >= finalsT.start_date) return null;

  // Rankings, ratings and names for the pool.
  const { data: dates } = await db.rpc("ranking_dates", { p_tour: tour });
  const rankingDate = ((dates ?? []) as string[]).find((d) => d <= asOf);
  if (!rankingDate) return null;
  const { data: ranked } = await db.from("rankings").select("player_id, rank, points").eq("tour", tour).eq("ranking_date", rankingDate).order("rank").limit(POOL);
  const ids = (ranked ?? []).map((r) => r.player_id);
  const { data: people } = await db.from("players").select("id, full_name, country_code").in("id", ids);
  const who = new Map((people ?? []).map((p) => [`id:${p.id}`, p]));
  const ratingOf = new Map<string, Rating>();
  if (live) {
    const { data: rated } = await db
      .from("player_ratings")
      .select("player_id, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches")
      .eq("tour", tour)
      .in("player_id", ids);
    for (const r of rated ?? [])
      ratingOf.set(`id:${r.player_id}`, { overall: r.elo, surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass }, matches: r.matches, surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches } });
  } else {
    // Each player's rating in the lab's weekly replay, the latest week before the date.
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("lab_ratings")
        .select("player_id, week, overall, hard, clay, grass, matches")
        .in("player_id", ids)
        .lt("week", asOf)
        .gte("week", `${season - 1}-01-01`)
        .order("week")
        .range(from, from + 999);
      for (const r of data ?? []) ratingOf.set(`id:${r.player_id}`, { overall: r.overall, surface: { hard: r.hard, clay: r.clay, grass: r.grass }, matches: r.matches, surfaceMatches: { hard: 99, clay: 99, grass: 99 } });
      if (!data || data.length < 1000) break;
    }
  }

  // Points per event, this season and last.
  const asEvents = (ts: T[]) => new Map<number, RaceEvent>(ts.filter((t) => countsForRace(tour, t.category)).map((t) => [t.id, { tour, category: t.category, rounds: roundsFor(t.draw_size) }]));
  const finished = (t: T | undefined) => Boolean(t?.end_date && t.end_date < asOf);
  const [curMatchesAll, prevMatches, race] = await Promise.all([getSeasonMatches(tour, season), getSeasonMatches(tour, season - 1), live ? getRace(tour, season) : null]);
  const byId = new Map(cur.map((t) => [t.id, t]));
  const curMatches = live ? curMatchesAll : curMatchesAll.filter((m) => finished(byId.get(m.tournamentId)));
  const curPts = eventPoints(curMatches, asEvents(cur));
  const prevPts = eventPoints(prevMatches, asEvents(prev));
  const raceRow = new Map((race?.rows ?? []).map((r) => [r.key, r]));
  const liveIds = new Set(live ? cur.filter((t) => t.start_date && t.start_date <= asOf && (t.end_date ?? asOf) >= asOf).map((t) => t.id) : []);

  const names = new Map([...who].map(([key, p]) => [normalizeName(p.full_name), key]));
  const finalsDrop = await finalsResults(tour, season - 1, names);

  // The rest of the calendar up to the finals (in a backtest, anything not finished yet).
  const prevByProvider = new Map(prev.map((t) => [t.provider_id, t]));
  const future = cur
    .filter((t) => countsForRace(tour, t.category) && t.start_date && (!finalsT?.start_date || t.start_date < finalsT.start_date))
    .filter((t) => (live ? t.start_date! > asOf : !finished(t)))
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!));
  const events: SimEvent[] = future.map((t) => {
    const drawSize = t.draw_size ?? prevByProvider.get(t.provider_id)?.draw_size ?? defaultDrawSize(t.category);
    return { key: String(t.id), week: monday(t.start_date!), category: t.category!, rounds: roundsFor(drawSize), drawSize };
  });
  const surfaceOf = new Map(future.map((t) => [String(t.id), normalizeSurface(t.surface)]));

  // Entry habits: last year's edition, and this season's rate at the category.
  const held = new Map<string, number>();
  for (const t of cur) if (countsForRace(tour, t.category) && finished(t)) held.set(t.category!, (held.get(t.category!) ?? 0) + 1);
  const lastPlayed = new Map<string, string>();
  for (const m of curMatches) for (const p of [m.p1, m.p2]) if (m.date > (lastPlayed.get(p.key) ?? "")) lastPlayed.set(p.key, m.date);
  const sameWeek = new Map<string, number>();
  for (const e of events) sameWeek.set(`${e.week}|${e.category}`, (sameWeek.get(`${e.week}|${e.category}`) ?? 0) + 1);
  const prevById = new Map(prev.map((t) => [t.id, t]));

  const players: SimPlayer[] = [];
  const rows = new Map<string, Omit<SeasonOutlookRow, keyof SeasonOutlook>>();
  for (const r of ranked ?? []) {
    const key = `id:${r.player_id}`;
    const mine = curPts.get(key) ?? new Map<number, number>();
    const last = prevPts.get(key) ?? new Map<number, number>();
    const row = raceRow.get(key);
    let racePts = 0;
    // Points from events finished since the ranking (not yet in it) and what's banked in live ones.
    let pending = row?.liveBanked ?? 0;
    for (const [tid, pts] of mine) {
      if (liveIds.has(tid)) continue;
      racePts += pts;
      const t = byId.get(tid);
      if (t?.end_date && t.end_date >= rankingDate) pending += pts;
    }
    if (row) racePts = row.points;
    // Last year's points that come off by year end: every edition within the last 52 weeks of the
    // ranking whose new edition hasn't finished before it (the finals are handled separately).
    let dropping = 0;
    for (const [tid, pts] of last) {
      const t = prevById.get(tid)!;
      const again = cur.find((x) => x.provider_id === t.provider_id);
      const replaced = again ? again.end_date !== null && again.end_date < rankingDate : t.end_date !== null && Date.parse(t.end_date) + 364 * DAY < Date.parse(rankingDate);
      if (!replaced) dropping += pts;
    }
    const recent = lastPlayed.get(key);
    const idle = recent ? (Date.parse(asOf) - Date.parse(recent)) / DAY : 999;
    const activity = [...mine.keys()].some((tid) => liveIds.has(tid)) ? 1 : idle > 120 ? 0.05 : idle > 42 ? 0.3 : 1;
    const entry: Record<string, number> = {};
    for (const e of events) {
      const t = future.find((x) => String(x.id) === e.key)!;
      const playedLast = [...last.keys()].some((tid) => prevById.get(tid)?.provider_id === t.provider_id);
      const playedCat = [...mine.keys()].filter((tid) => byId.get(tid)?.category === e.category && !liveIds.has(tid)).length;
      const rate = Math.min(1, (playedCat + 0.5) / ((held.get(e.category) ?? 0) + 1));
      const base = playedLast ? 0.35 + 0.65 * rate : (0.75 * rate) / (sameWeek.get(`${e.week}|${e.category}`) ?? 1);
      entry[e.key] = Math.min(0.97, base * activity);
    }
    const points = (r.points ?? 0) + pending;
    players.push({ key, rank: r.rank, race: racePts, ranking: points, live: row?.liveOutcomes ?? [], liveBanked: row?.liveBanked ?? 0, drops: { end: dropping }, entry });
    const p = who.get(key);
    rows.set(key, { id: r.player_id, name: p?.full_name ?? key, country: p?.country_code ?? null, rank: r.rank, points, dropping: dropping + (finalsDrop[key] ?? 0), racePoints: racePts });
  }

  // Qualifiers and wildcards: the median rating of players ranked 90–150.
  const fieldRatings = (ranked ?? [])
    .filter((r) => r.rank >= 90 && r.rank <= 150)
    .map((r) => ratingOf.get(`id:${r.player_id}`)?.overall)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  const fieldElo = fieldRatings[Math.floor(fieldRatings.length / 2)] ?? 1500;
  const field: Rating = { overall: fieldElo, surface: { hard: fieldElo, clay: fieldElo, grass: fieldElo }, matches: 99, surfaceMatches: { hard: 99, clay: 99, grass: 99 } };
  const rating = (k: string) => (k === FIELD ? field : (ratingOf.get(k) ?? field));
  const chance = (a: string, b: string, e: SimEvent) => {
    const q = calibrate(winProbability(rating(a), rating(b), surfaceOf.get(e.key) ?? "hard"), calibration);
    return tour === "atp" && e.category === "Grand Slam" ? bestOfFive(q) : q;
  };
  return { season, rankingDate, finalsT, future, events, players, rows, chance, finalsDrop, names };
}

/**
 * The rest of the season simulated from today: each player's chance of qualifying for the
 * season finals, finishing No. 1 and ending in the top 10. Stored in stat_cache as season:<tour>
 * and appended daily to season_odds.
 */
export async function computeSeasonOutlook(db: AdminClient, now = new Date(), backtest = false) {
  const today = now.toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  const { data: model } = await db.from("sync_state").select("details").eq("key", "model").maybeSingle();
  const calibration = ((model?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};

  for (const tour of ["atp", "wta"] as const) {
    const s = await buildSeason(db, tour, today, true, calibration[tour] ?? 1);
    if (!s) {
      out[tour] = "season over";
      continue;
    }
    const outlook = simulateSeason({ tour, players: s.players, events: s.events, chance: s.chance, finals: { spots: 8, drop: s.finalsDrop }, formSd: FORM_SD, sims: SIMS });
    const result: SeasonOutlookRow[] = outlook
      .map((o) => ({ ...o, ...s.rows.get(o.key)! }))
      .filter((r) => r.finals >= 0.0005 || r.top10 >= 0.0005 || (r.rank ?? 999) <= 30)
      .sort((a, b) => b.finals - a.finals || b.top10 - a.top10 || b.racePoints - a.racePoints);

    // Keep the stored backtest unless asked to recompute it (it replays a whole past season).
    const { data: old } = await db.from("stat_cache").select("data").eq("key", `season:${tour}`).maybeSingle();
    const tests = backtest ? await seasonBacktest(db, tour, s.season - 1, calibration[tour] ?? 1) : ((old?.data as unknown as SeasonOutlookCache | undefined)?.backtest ?? []);
    const data: SeasonOutlookCache = {
      generated: now.toISOString(),
      season: s.season,
      rankingDate: s.rankingDate,
      sims: SIMS,
      finalsStart: s.finalsT?.start_date ?? null,
      events: s.future.map((t) => ({ name: t.name, category: t.category!, week: monday(t.start_date!) })),
      players: result,
      backtest: tests,
    };
    const { error } = await db.from("stat_cache").upsert({ key: `season:${tour}`, data: data as unknown as Json });
    if (error) throw new Error(`season outlook: ${error.message}`);
    const history = result
      .filter((r) => r.finals > 0 || r.no1 > 0 || r.top10 > 0)
      .map((r) => ({ tour, day: today, player_id: r.id, finals: r.finals, no1: r.no1, top10: r.top10 }));
    const { error: hErr } = await db.from("season_odds").upsert(history, { onConflict: "tour,day,player_id" });
    if (hErr) throw new Error(`season outlook: history: ${hErr.message}`);
    out[tour] = `${s.events.length} events, ${result.length} players${backtest ? `, backtest ${tests.length}` : ""}`;
  }
  return out;
}

/** Replays a past season's simulator from a few dates using only what was known then, and scores it. */
export async function seasonBacktest(db: AdminClient, tour: Tour, season: number, calibration: number): Promise<SeasonBacktest[]> {
  const out: SeasonBacktest[] = [];
  for (const asOf of [`${season}-08-04`, `${season}-09-01`, `${season}-10-06`]) {
    const s = await buildSeason(db, tour, monday(asOf), false, calibration);
    if (!s) continue;
    const outlook = simulateSeason({ tour, players: s.players, events: s.events, chance: s.chance, finals: { spots: 8, drop: s.finalsDrop }, formSd: FORM_SD, sims: 1000 });
    // What happened: who qualified (the Finals page's seeds, withdrawals included) and the year-end No. 1.
    const title = `${season} ${tour.toUpperCase()} Finals – Singles`;
    const page = (await latestRevisions([title]).catch(() => new Map<string, { content: string }>())).get(title);
    const actual = new Set(finalsQualifiers(page?.content ?? "").map((n) => s.names.get(normalizeName(n))).filter((k): k is string => k !== undefined));
    if (actual.size < 8) continue;
    const { data: dates } = await db.rpc("ranking_dates", { p_tour: tour });
    const yearEnd = ((dates ?? []) as string[]).filter((d) => d.startsWith(String(season))).sort().at(-1);
    const { data: top } = yearEnd ? await db.from("rankings").select("player_id").eq("tour", tour).eq("ranking_date", yearEnd).eq("rank", 1).maybeSingle() : { data: null };
    const name = (key: string) => s.rows.get(key)?.name ?? key;
    const byRace = [...outlook].sort((a, b) => s.rows.get(b.key)!.racePoints - s.rows.get(a.key)!.racePoints);
    const top30 = byRace.slice(0, 30);
    const brier = top30.reduce((sum, o) => sum + (o.finals - (actual.has(o.key) ? 1 : 0)) ** 2, 0) / top30.length;
    const baseline = top30.reduce((sum, o, i) => sum + ((i < 8 ? 1 : 0) - (actual.has(o.key) ? 1 : 0)) ** 2, 0) / top30.length;
    const no1Key = top ? `id:${top.player_id}` : null;
    out.push({
      asOf: monday(asOf),
      qualifiers: outlook.filter((o) => actual.has(o.key)).map((o) => ({ name: name(o.key), chance: o.finals })).sort((a, b) => b.chance - a.chance),
      missed: outlook.filter((o) => !actual.has(o.key) && o.finals >= 0.2).map((o) => ({ name: name(o.key), chance: o.finals })).sort((a, b) => b.chance - a.chance),
      brier: Math.round(brier * 10000) / 10000,
      baseline: Math.round(baseline * 10000) / 10000,
      no1: no1Key ? { name: name(no1Key), chance: outlook.find((o) => o.key === no1Key)?.no1 ?? 0 } : null,
    });
  }
  return out;
}
