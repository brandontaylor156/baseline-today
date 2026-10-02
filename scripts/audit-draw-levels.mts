// Re-checks every stored tournament → draw page pairing against the category level rule.
//   npm run audit:draws            (report only)
//   npm run audit:draws -- --fix   (hide results of failing pairings and queue rediscovery)
import { createAdminClient } from "@/lib/supabase/admin";
import { levelFits } from "@/lib/wiki/identity";

const fix = process.argv.includes("--fix");
const db = createAdminClient();
const UA = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";

const { data: draws, error } = await db
  .from("wiki_draws")
  .select("tournament_id, page_title, tournaments!inner(tour, name, category, season)")
  .eq("status", "found");
if (error) throw new Error(error.message);

const rows = (draws ?? []) as unknown as { tournament_id: number; page_title: string; tournaments: { tour: "atp" | "wta"; name: string; category: string | null; season: number } }[];
const categories = new Map<string, string[]>();
for (let i = 0; i < rows.length; i += 50) {
  const titles = rows.slice(i, i + 50).map((r) => r.page_title);
  const params = new URLSearchParams({ action: "query", prop: "categories", cllimit: "max", titles: titles.join("|"), format: "json", formatversion: "2", maxlag: "5" });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { "User-Agent": UA } });
  const body = (await res.json()) as { query?: { pages?: { title: string; categories?: { title: string }[] }[] } };
  for (const p of body.query?.pages ?? []) categories.set(p.title, (p.categories ?? []).map((c) => c.title.replace(/^Category:/, "")));
}

const failing = rows.filter((r) => !levelFits(categories.get(r.page_title) ?? [], r.tournaments.tour, r.tournaments.category));
console.log(`checked ${rows.length} pairings, ${failing.length} fail the level rule`);
for (const r of failing) {
  const level = (categories.get(r.page_title) ?? []).filter((c) => /Tour|125/.test(c)).join(", ");
  console.log(`  ${r.tournaments.season} ${r.tournaments.tour} ${r.tournaments.name} (${r.tournaments.category}) -> ${r.page_title} [${level}]`);
}

if (fix && failing.length) {
  const ids = failing.map((r) => r.tournament_id);
  const hidden = await db.from("matches").update({ confirmed: false }).eq("provider", "wikipedia").in("tournament_id", ids).select("id");
  const reset = await db
    .from("wiki_draws")
    .update({ status: "pending", page_title: null, page_url: null, last_revid: null, last_rev_at: null, note: "failed level check; rediscover" })
    .in("tournament_id", ids)
    .select("tournament_id");
  console.log(`hid ${hidden.data?.length ?? 0} results, queued ${reset.data?.length ?? 0} tournaments for rediscovery`);
}
