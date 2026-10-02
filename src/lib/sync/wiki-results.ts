import "server-only";

import type { Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { isPlausibleResult, parseDraw } from "@/lib/wiki/draw-parse";
import { latestRevisionIds, latestRevisions, pageUrl, searchDrawPages, type PageRevision } from "@/lib/wiki/client";
import { drawSizeFits, editionMatches, levelFits, searchPhrases, titleScore, tourMentioned } from "@/lib/wiki/identity";
import { normalizeName } from "@/lib/wiki/names";
import {
  findPlayer,
  knownPlayers,
  playerIndex,
  resultSignature,
  titleFitsTour,
  WIKI_PROVIDER,
  wikiMatchRow,
} from "@/lib/wiki/rows";

/** One refresh at a time, whoever triggers it (cron every 10 min, page visits). */
export const RESULTS_LOCK_SECONDS = 120;
/** Safeguard: results show only once their page has had no edits for this long. */
export const STABLE_MINUTES = 10;
/** Page visits trigger a refresh when results are older than this. */
export const RESULTS_STALE_MINUTES = 15;
const REDISCOVER_HOURS = 6;
const DISCOVERIES_PER_RUN = 4;

type Tournament = Pick<Tables<"tournaments">, "id" | "tour" | "name" | "location" | "category" | "season" | "start_date" | "end_date" | "draw_size">;

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const day = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const bestOf = (t: Tournament): 3 | 5 => (t.tour === "atp" && /grand slam/i.test(t.category ?? "") ? 5 : 3);

async function loadIndex(db: AdminClient, tour: Tour, cache: Map<Tour, Map<string, number>>) {
  const cached = cache.get(tour);
  if (cached) return cached;
  const { data, error } = await db.from("players").select("id, full_name").eq("tour", tour).range(0, 4999);
  fail("load players", error);
  const index = playerIndex(data ?? []);
  cache.set(tour, index);
  return index;
}

/**
 * Finds the tournament's singles draw page. The title must identify the tournament (distinctive
 * word or alias, matching edition number, right tour); the best title match wins. Player overlap
 * only confirms the tour, and a page already assigned to another tournament is never reused.
 */
async function discover(db: AdminClient, t: Tournament, index: Map<string, number>, now: Date) {
  const season = t.season ?? Number(t.start_date?.slice(0, 4));
  const scored = new Map<string, number>();
  for (const q of searchPhrases(t.name, t.location)) {
    for (const title of await searchDrawPages(season, q)) {
      if (scored.has(title) || !titleFitsTour(title, t.tour as Tour) || !editionMatches(t.name, title)) continue;
      const score = titleScore(title, t.name, t.location, t.tour as Tour);
      if (score > 0) scored.set(title, score);
    }
  }

  const { data: taken } = await db
    .from("wiki_draws")
    .select("page_title")
    .eq("status", "found")
    .neq("tournament_id", t.id)
    .in("page_title", [...scored.keys()].length ? [...scored.keys()] : [""]);
  const takenTitles = new Set((taken ?? []).map((r) => r.page_title));
  const candidates = [...scored.entries()]
    .filter(([title]) => !takenTitles.has(title))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([title]) => title);

  let best: { rev: PageRevision; known: number; score: number } | null = null;
  const revs = await latestRevisions(candidates);
  for (const title of candidates) {
    const rev = revs.get(title);
    if (!rev) continue;
    const parsed = parseDraw(rev.content, normalizeName);
    const pagePlayers = new Set(parsed.flatMap((m) => [normalizeName(m.p1.name), normalizeName(m.p2.name)])).size;
    // Right tour (WTA vs ATP mentions) and a draw that fits the tournament's size.
    if (
      !tourMentioned(rev.content, t.tour as Tour) ||
      !levelFits(rev.categories, t.tour as Tour, t.category) ||
      !drawSizeFits(pagePlayers, t.draw_size)
    ) {
      continue;
    }
    const known = knownPlayers(parsed, index);
    const score = scored.get(title)!;
    if (!best || score > best.score || (score === best.score && known > best.known)) best = { rev, known, score };
  }

  const { error } = await db.from("wiki_draws").upsert({
    tournament_id: t.id,
    status: best ? "found" : "not_found",
    page_title: best?.rev.title ?? null,
    page_url: best ? pageUrl(best.rev.title) : null,
    discovered_at: now.toISOString(),
    note: best ? `title score ${best.score}, ${best.known} known players` : `no identifiable page among ${scored.size} candidates`,
  });
  fail("save draw page", error);
  return best?.rev ?? null;
}

/** Stores a page's finished results, applying the plausibility and stability safeguards. */
async function applyDraw(db: AdminClient, t: Tournament, rev: PageRevision, index: Map<string, number>, now: Date) {
  const sourceUrl = pageUrl(rev.title);
  const pageStable = Date.parse(rev.timestamp) <= now.getTime() - STABLE_MINUTES * 60 * 1000;
  const parsed = parseDraw(rev.content, normalizeName).filter((m) => m.winner !== null && isPlausibleResult(m, bestOf(t)));

  const { data: existing, error: exErr } = await db
    .from("matches")
    .select("provider_id, winner_side, score, result_detail, confirmed, score_changed_at")
    .eq("provider", WIKI_PROVIDER)
    .eq("tournament_id", t.id);
  fail("read stored results", exErr);
  const before = new Map((existing ?? []).map((e) => [e.provider_id, e]));

  const ctx = { tour: t.tour as Tour, tournamentId: t.id, season: t.season, sourceUrl, index };
  const rows = parsed.map((m) => {
    const draft = wikiMatchRow(m, ctx, false, now);
    const prev = before.get(draft.provider_id);
    const unchanged = prev && resultSignature(prev) === resultSignature({ winner_side: draft.winner_side ?? null, score: draft.score ?? null, result_detail: draft.result_detail ?? null });
    return {
      ...draft,
      confirmed: pageStable || Boolean(unchanged && prev.confirmed),
      score_changed_at: unchanged ? prev.score_changed_at : now.toISOString(),
    };
  });
  if (rows.length) {
    const { error } = await db.from("matches").upsert(rows, { onConflict: "provider,tour,provider_id" });
    fail("save results", error);
  }

  // A stored result that is no longer on the page (reverted, vandalized) is hidden.
  const present = new Set(rows.map((r) => r.provider_id));
  const gone = [...before.keys()].filter((id) => !present.has(id));
  if (gone.length) {
    const { error } = await db.from("matches").update({ confirmed: false }).eq("provider", WIKI_PROVIDER).in("provider_id", gone);
    fail("hide removed results", error);
  }

  const { error } = await db
    .from("wiki_draws")
    .update({ last_revid: rev.revid, last_rev_at: rev.timestamp, checked_at: now.toISOString() })
    .eq("tournament_id", t.id);
  fail("save draw revision", error);
  return { results: rows.length, hidden: gone.length };
}

export interface ResultsRefresh {
  status: "ok" | "skipped" | "error";
  tournaments?: number;
  discovered?: number;
  pagesChanged?: number;
  results?: number;
  confirmed?: number;
  error?: string;
}

/** Refreshes results for tournaments in play (and up to two days after they end). */
export async function refreshResults(db: AdminClient, now = new Date()): Promise<ResultsRefresh> {
  const { data: locked, error: lockErr } = await db.rpc("try_acquire_sync_lock", { p_key: "results", p_ttl_seconds: RESULTS_LOCK_SECONDS });
  if (lockErr) return { status: "error", error: lockErr.message };
  if (!locked) return { status: "skipped" };

  try {
    const { data: tournaments, error } = await db
      .from("tournaments")
      .select("id, tour, name, location, category, season, start_date, end_date, draw_size")
      .eq("provider", "balldontlie")
      .not("category", "is", null)
      .lte("start_date", isoDate(new Date(now.getTime() + day)))
      .gte("end_date", isoDate(new Date(now.getTime() - 2 * day)));
    fail("find active tournaments", error);
    const active = tournaments ?? [];
    const summary = await processTournaments(db, active, now, DISCOVERIES_PER_RUN);

    await db.from("sync_state").update({ last_refreshed_at: now.toISOString(), status: "ok", details: summary as unknown as Json }).eq("key", "results");
    return { status: "ok", tournaments: active.length, ...summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("sync_state").update({ status: "error", details: { error: message } as Json }).eq("key", "results");
    return { status: "error", error: message };
  }
}

async function processTournaments(db: AdminClient, list: Tournament[], now: Date, maxDiscoveries: number) {
  const cache = new Map<Tour, Map<string, number>>();
  const summary = { discovered: 0, pagesChanged: 0, results: 0, confirmed: 0 };
  if (list.length === 0) return summary;

  const { data: draws, error } = await db.from("wiki_draws").select("*").in("tournament_id", list.map((t) => t.id));
  fail("read draw pages", error);
  const drawFor = new Map((draws ?? []).map((d) => [d.tournament_id, d]));

  // 1. Discover pages not found yet (rate-limited per tournament).
  let discoveries = 0;
  for (const t of list) {
    const d = drawFor.get(t.id);
    const due = !d || d.status === "pending" || (d.status === "not_found" && (!d.discovered_at || now.getTime() - Date.parse(d.discovered_at) > REDISCOVER_HOURS * 3600 * 1000));
    if (!due || discoveries >= maxDiscoveries) continue;
    discoveries++;
    const rev = await discover(db, t, await loadIndex(db, t.tour as Tour, cache), now);
    if (rev) {
      summary.discovered++;
      const applied = await applyDraw(db, t, rev, await loadIndex(db, t.tour as Tour, cache), now);
      summary.pagesChanged++;
      summary.results += applied.results;
      drawFor.set(t.id, { ...(d ?? ({} as Tables<"wiki_draws">)), tournament_id: t.id, status: "found", page_title: rev.title, last_revid: rev.revid, last_rev_at: rev.timestamp } as Tables<"wiki_draws">);
    }
  }

  // 2. For known pages, download only those with new revisions.
  const found = list.filter((t) => drawFor.get(t.id)?.status === "found" && drawFor.get(t.id)?.page_title);
  const revIds = await latestRevisionIds(found.map((t) => drawFor.get(t.id)!.page_title!));
  const changed = found.filter((t) => {
    const d = drawFor.get(t.id)!;
    const latest = revIds.get(d.page_title!);
    return latest && latest.revid !== d.last_revid;
  });
  const revs = await latestRevisions(changed.map((t) => drawFor.get(t.id)!.page_title!));
  for (const t of changed) {
    const rev = revs.get(drawFor.get(t.id)!.page_title!);
    if (!rev) continue;
    const applied = await applyDraw(db, t, rev, await loadIndex(db, t.tour as Tour, cache), now);
    summary.pagesChanged++;
    summary.results += applied.results;
  }

  // 3. Pages unchanged for STABLE_MINUTES: their pending results become visible.
  const stableIds = found
    .filter((t) => !changed.includes(t))
    .filter((t) => {
      const at = drawFor.get(t.id)?.last_rev_at;
      return at && Date.parse(at) <= now.getTime() - STABLE_MINUTES * 60 * 1000;
    })
    .map((t) => t.id);
  if (stableIds.length) {
    const { data: confirmed, error: cErr } = await db
      .from("matches")
      .update({ confirmed: true })
      .eq("provider", WIKI_PROVIDER)
      .eq("confirmed", false)
      .in("tournament_id", stableIds)
      .select("id");
    fail("confirm results", cErr);
    summary.confirmed += confirmed?.length ?? 0;
  }
  return summary;
}

/**
 * Links stored results to player profiles added since (e.g. by the rankings backfill). Results
 * keep their names either way; this only fills in missing player ids.
 */
export async function relinkPlayers(db: AdminClient) {
  const cache = new Map<Tour, Map<string, number>>();
  let linked = 0;
  for (const tour of ["atp", "wta"] as const) {
    const index = await loadIndex(db, tour, cache);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("matches")
        .select("id, player1_id, player2_id, player1_name, player2_name, winner_side")
        .eq("provider", WIKI_PROVIDER)
        .eq("tour", tour)
        .or("player1_id.is.null,player2_id.is.null")
        .order("id")
        .range(from, from + 999);
      fail("unlinked results", error);
      for (const m of data ?? []) {
        const p1 = m.player1_id ?? (m.player1_name ? findPlayer(index, m.player1_name) : null);
        const p2 = m.player2_id ?? (m.player2_name ? findPlayer(index, m.player2_name) : null);
        if (p1 === m.player1_id && p2 === m.player2_id) continue;
        const winner = m.winner_side === 1 ? p1 : m.winner_side === 2 ? p2 : null;
        const { error: uErr } = await db.from("matches").update({ player1_id: p1, player2_id: p2, winner_id: winner }).eq("id", m.id);
        fail("relink", uErr);
        linked++;
      }
      if (!data || data.length < 1000) break;
    }
  }
  return linked;
}

/** One-off: discover and import every finished tournament of a season (npm run sync:results). */
export async function backfillResults(db: AdminClient, season: number, now = new Date()) {
  const { data, error } = await db
    .from("tournaments")
    .select("id, tour, name, location, category, season, start_date, end_date, draw_size")
    .eq("provider", "balldontlie")
    .eq("season", season)
    .not("category", "is", null)
    .lte("start_date", isoDate(now))
    .order("start_date");
  fail("season tournaments", error);
  return processTournaments(db, data ?? [], now, Number.POSITIVE_INFINITY);
}
