import "server-only";

import { auditDraw, benjaminiHochberg, type AuditLine } from "@/lib/lab/draw-audit";
import { playerKey } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const DAY = 86_400_000;

export interface AuditedDraw {
  tournamentId: number;
  tour: string;
  name: string;
  season: number;
  category: string | null;
  /** Mean pre-event rating of the top-8 seeds' first-round opponents, actual and expected; p-value; whether it survives the false discovery rate. */
  observed: number;
  expected: number;
  p: number;
  seeds: number;
  flagged: boolean;
}

export interface DrawAuditCache {
  generated: string;
  draws: number;
  /** Share of draws with p < 0.05 (about 5% if draws are fair) and how many survive Benjamini–Hochberg at 5%. */
  under05: number;
  flagged: number;
  /** Mean of (observed − expected) across all draws, in rating points (about 0 if fair). */
  meanGap: number;
  byCategory: { category: string; draws: number; under05: number; meanGap: number }[];
  results: AuditedDraw[];
}

type Line = { p: number; name: string; id: number | null; seed: string | null };

/**
 * Audits every stored bracket: were the top seeds' first-round opponents weaker than random
 * placement of the unseeded field would give? Stored in stat_cache as lab:draw-audit. Weekly.
 */
export async function computeDrawAudit(db: AdminClient, now = new Date(), full = false) {
  // Finished draws don't change: reuse earlier results (by tournament) unless `full`.
  const { data: old } = await db.from("stat_cache").select("data").eq("key", "lab:draw-audit").maybeSingle();
  const previous = new Map(full ? [] : ((old?.data as unknown as DrawAuditCache | undefined)?.results ?? []).map((r) => [r.tournamentId, r]));
  const results: AuditedDraw[] = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await db
      .from("wiki_draws")
      .select("tournament_id, bracket, tournaments!inner(tour, name, season, category, start_date)")
      .not("bracket->lines", "is", null)
      .order("tournament_id")
      .range(from, from + 99);
    if (error) throw new Error(`draw audit: load: ${error.message}`);
    for (const d of (data ?? []) as unknown as { tournament_id: number; bracket: { lines?: Line[] }; tournaments: { tour: string; name: string; season: number; category: string | null; start_date: string | null } }[]) {
      const t = d.tournaments;
      if (!t.start_date || !d.bracket.lines?.length) continue;
      const known = previous.get(d.tournament_id);
      if (known && t.start_date < new Date(now.getTime() - 21 * 86_400_000).toISOString().slice(0, 10)) {
        results.push(known);
        continue;
      }
      const lines: AuditLine[] = d.bracket.lines.map((l) => {
        const n = Number(l.seed?.match(/^\d+/)?.[0]);
        return { position: l.p, key: playerKey(l.id, l.name), seed: Number.isFinite(n) && n > 0 ? n : null };
      });
      // Each player's rating in the lab's weekly replay, from the latest week before the event.
      const since = new Date(Date.parse(`${t.start_date}T00:00:00Z`) - 400 * DAY).toISOString().slice(0, 10);
      const { data: ratings } = await db
        .from("lab_ratings")
        .select("player_key, week, overall")
        .in("player_key", lines.map((l) => l.key))
        .lt("week", t.start_date)
        .gte("week", since)
        .order("week")
        .limit(5000);
      const rating = new Map<string, number>();
      for (const r of ratings ?? []) rating.set(r.player_key, r.overall);
      const res = auditDraw(lines, (k) => rating.get(k) ?? null, 8, 2000, d.tournament_id);
      if (!res) continue;
      results.push({ tournamentId: d.tournament_id, tour: t.tour, name: t.name, season: t.season, category: t.category, ...res, flagged: false });
    }
    if (!data || data.length < 100) break;
  }
  const flags = benjaminiHochberg(results.map((r) => r.p));
  results.forEach((r, i) => (r.flagged = flags[i]));
  const gap = (xs: AuditedDraw[]) => (xs.length ? xs.reduce((s, r) => s + r.observed - r.expected, 0) / xs.length : 0);
  const categories = [...new Set(results.map((r) => r.category ?? "Other"))];
  const data: DrawAuditCache = {
    generated: now.toISOString(),
    draws: results.length,
    under05: results.filter((r) => r.p < 0.05).length / Math.max(1, results.length),
    flagged: results.filter((r) => r.flagged).length,
    meanGap: gap(results),
    byCategory: categories
      .map((c) => {
        const xs = results.filter((r) => (r.category ?? "Other") === c);
        return { category: c, draws: xs.length, under05: xs.filter((r) => r.p < 0.05).length / xs.length, meanGap: gap(xs) };
      })
      .filter((c) => c.draws >= 5)
      .sort((a, b) => b.draws - a.draws),
    results: results.sort((a, b) => a.p - b.p),
  };
  const { error } = await db.from("stat_cache").upsert({ key: "lab:draw-audit", data: data as unknown as Json });
  if (error) throw new Error(`draw audit: ${error.message}`);
  return `${data.draws} draws, ${(data.under05 * 100).toFixed(1)}% under 0.05, ${data.flagged} flagged, mean gap ${data.meanGap.toFixed(1)}`;
}
