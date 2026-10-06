import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { latestRevisions } from "@/lib/wiki/client";
import { isPlausibleResult, parseDraw } from "@/lib/wiki/draw-parse";
import { eventDates } from "@/lib/wiki/event-dates";
import { normalizeName } from "@/lib/wiki/names";
import { roundRank } from "@/lib/wiki/rows";

const USER_AGENT = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";

async function wiki<T>(params: Record<string, string>): Promise<T | null> {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return null;
}

/** Singles draw pages linked from a season's "ATP Challenger Tour" article. */
async function drawTitles(season: number): Promise<string[]> {
  const body = await wiki<{ parse?: { links?: { title: string; exists?: boolean }[] } }>({ action: "parse", page: `${season} ATP Challenger Tour`, prop: "links" });
  return [...new Set((body?.parse?.links ?? []).filter((l) => l.exists !== false && /^\d{4} .*[–-] (Men's )?[Ss]ingles$/.test(l.title)).map((l) => l.title))];
}

const eventArticle = (drawTitle: string) => drawTitle.replace(/\s+[–-]\s+(Men's )?[Ss]ingles$/, "");

/** Infobox fields of event articles (date, surface, location), a few at a time. */
export async function infoboxes(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Small batches: with page content, Wikipedia truncates big responses (the rest would need continuation).
  for (let i = 0; i < titles.length; i += 5) {
    const chunk = titles.slice(i, i + 5);
    const body = await wiki<{ query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } }>({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      rvsection: "0",
      redirects: "1",
      titles: chunk.join("|"),
    });
    const step = (list?: { from: string; to: string }[]) => new Map((list ?? []).map((x) => [x.from, x.to]));
    const norm = step(body?.query?.normalized);
    const redir = step(body?.query?.redirects);
    const content = new Map((body?.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots.main.content ?? ""]));
    for (const t of chunk) {
      const n = norm.get(t) ?? t;
      out.set(t, content.get(redir.get(n) ?? n) ?? "");
    }
  }
  return out;
}

/** An infobox field as plain text (links reduced to their labels, templates and references dropped). */
export const field = (wikitext: string, name: string) =>
  // Infobox fields start a line ("| date=…"); a "date=" inside {{Use mdy dates|date=…}} doesn't.
  (wikitext.match(new RegExp(`(?:^|\\n)\\s*\\|\\s*${name}\\s*=([^\\n]*)`, "i"))?.[1] ?? "")
    .replace(/<ref[\s\S]*$/i, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .trim();

/** Hard, Clay, Grass or Carpet from an infobox surface field. */
const surfaceOf = (raw: string) => (/clay/i.test(raw) ? "Clay" : /grass/i.test(raw) ? "Grass" : /carpet/i.test(raw) ? "Carpet" : /hard/i.test(raw) ? "Hard" : null);

/**
 * Imports ATP Challenger singles results for the given seasons from Wikipedia. Past seasons: each
 * draw page once. The current season: events not yet over, again.
 */
export async function importChallengers(db: AdminClient, seasons: number[], now = new Date()): Promise<string> {
  let events = 0;
  let results = 0;
  for (const season of seasons) {
    const titles = await drawTitles(season);
    const { data: known } = await db.from("challenger_events").select("draw_title, end_date").eq("season", season).limit(1000);
    const done = new Map((known ?? []).map((k) => [k.draw_title, k.end_date]));
    const todo = titles.filter((t) => !done.has(t) || !done.get(t) || done.get(t)! >= new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10));
    const boxes = await infoboxes(todo.map(eventArticle));
    for (const title of todo) {
      const page = (await latestRevisions([title]).catch(() => new Map())).get(title);
      if (!page) continue;
      const matches = parseDraw(page.content, normalizeName).filter((m) => m.winner !== null && isPlausibleResult(m, 3));
      const box = boxes.get(eventArticle(title)) ?? "";
      const dates = eventDates(field(box, "date") || field(box, "dates"), season);
      const { data: ev, error } = await db
        .from("challenger_events")
        .upsert(
          {
            season,
            draw_title: title,
            article: eventArticle(title),
            name: eventArticle(title).replace(/^\d{4}\s+/, ""),
            start_date: dates?.start ?? null,
            end_date: dates?.end ?? null,
            surface: surfaceOf(field(box, "surface")),
            location: field(box, "location") || null,
            matches: matches.length,
            checked_at: new Date().toISOString(),
          },
          { onConflict: "draw_title" },
        )
        .select("id")
        .single();
      if (error || !ev) throw new Error(`challengers: event: ${error?.message}`);
      const rows = matches.map((m) => ({
        event_id: ev.id,
        round: m.round,
        round_rank: roundRank(m.round),
        player1_name: m.p1.name,
        player2_name: m.p2.name,
        player1_country: m.p1.country,
        player2_country: m.p2.country,
        winner_side: m.winner,
        set_scores: m.sets as unknown as Json,
        result_detail: m.detail,
      }));
      // Unique per round and pairing; a page can list the same pairing twice only by mistake.
      const unique = [...new Map(rows.map((r) => [`${r.round}|${r.player1_name}|${r.player2_name}`, r])).values()];
      if (unique.length) {
        const { error: e } = await db.from("challenger_matches").upsert(unique, { onConflict: "event_id,round,player1_name,player2_name" });
        if (e) throw new Error(`challengers: matches: ${e.message}`);
      }
      events++;
      results += unique.length;
    }
  }
  return `${events} events, ${results} results`;
}
