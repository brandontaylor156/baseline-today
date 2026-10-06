import "server-only";

import { playerKey } from "@/lib/model/load";
import { birthDatesByTitle } from "@/lib/photos/wikimedia";
import type { Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";

const RECHECK_DAYS = 90;

/**
 * Looks up birth dates for players known only by name (from the draws), via their Wikipedia
 * article's Wikidata item. New names first, misses rechecked every 90 days; `limit` caps one run.
 */
export async function syncPeople(db: AdminClient, limit = 400): Promise<string> {
  const names: { tour: string; name: string; country: string | null; n: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.rpc("lab_unlinked_names").order("tour").order("name").range(from, from + 999);
    if (error) throw new Error(`people: names: ${error.message}`);
    names.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // The most common spelling per player key.
  const best = new Map<string, { tour: Tour; name: string; country: string | null; n: number }>();
  for (const r of names) {
    const key = playerKey(null, r.name);
    const seen = best.get(key);
    if (!seen || r.n > seen.n) best.set(key, { tour: r.tour as Tour, name: r.name, country: seen?.country ?? r.country, n: r.n });
    else if (!seen.country) seen.country = r.country;
  }

  const known = new Map<string, string>();
  const noCountry = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("lab_people").select("player_key, checked_at, country").range(from, from + 999);
    if (e) throw new Error(`people: known: ${e.message}`);
    for (const r of data ?? []) {
      known.set(r.player_key, r.checked_at);
      if (!r.country) noCountry.add(r.player_key);
    }
    if (!data || data.length < 1000) break;
  }
  // Countries from the draws, for players looked up before countries were kept.
  const countries = [...noCountry].flatMap((key) => {
    const v = best.get(key);
    return v?.country ? [{ player_key: key, tour: v.tour, name: v.name, country: v.country }] : [];
  });
  for (let i = 0; i < countries.length; i += 500) {
    const { error: e } = await db.from("lab_people").upsert(countries.slice(i, i + 500), { onConflict: "player_key" });
    if (e) throw new Error(`people: countries: ${e.message}`);
  }

  const stale = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString();
  const todo = [...best.entries()]
    .filter(([key]) => (known.get(key) ?? "") < stale)
    .sort(([a], [b]) => Number(known.has(a)) - Number(known.has(b)))
    .slice(0, limit);

  let found = 0;
  for (const tour of ["atp", "wta"] as const) {
    const batch = todo.filter(([, v]) => v.tour === tour);
    if (batch.length === 0) continue;
    const dates = await birthDatesByTitle(batch.map(([, v]) => v.name), tour);
    const rows = batch.map(([key, v]) => {
      const hit = dates.get(v.name);
      if (hit?.birthDate) found++;
      return { player_key: key, tour, name: v.name, country: v.country, wikidata_id: hit?.wikidataId ?? null, birth_date: hit?.birthDate ?? null, checked_at: new Date().toISOString() };
    });
    const { error: e } = await db.from("lab_people").upsert(rows, { onConflict: "player_key" });
    if (e) throw new Error(`people: save: ${e.message}`);
  }
  return `${todo.length} checked, ${found} birth dates`;
}
