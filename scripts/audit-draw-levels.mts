// Re-checks every stored tournament → draw page pairing against the level rule
// (English pages: categories; Italian pages: the level named in the text).
//   npm run audit:draws            (report only)
//   npm run audit:draws -- --fix   (hide results of failing pairings and queue rediscovery)
import { createAdminClient } from "@/lib/supabase/admin";
import { levelFits, levelInText } from "@/lib/wiki/identity";

const fix = process.argv.includes("--fix");
const db = createAdminClient();
const UA = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";

// Page through: the API returns at most 1,000 rows per request.
const draws: unknown[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("wiki_draws")
    .select("tournament_id, page_title, tournaments!inner(tour, name, category, season)")
    .eq("status", "found")
    .order("tournament_id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  draws.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}

type Row = { tournament_id: number; page_title: string; tournaments: { tour: "atp" | "wta"; name: string; category: string | null; season: number } };
const rows = (draws ?? []) as unknown as Row[];
const english = rows.filter((r) => !r.page_title.startsWith("it:"));
const italian = rows.filter((r) => r.page_title.startsWith("it:"));

async function query(lang: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ action: "query", format: "json", formatversion: "2", maxlag: "5", ...params });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { "User-Agent": UA } });
  return (await res.json()) as { query?: { pages?: { title: string; categories?: { title: string }[]; revisions?: { slots: { main: { content: string } } }[] }[] } };
}

const categories = new Map<string, string[]>();
for (let i = 0; i < english.length; i += 50) {
  const body = await query("en", { prop: "categories", cllimit: "max", titles: english.slice(i, i + 50).map((r) => r.page_title).join("|") });
  for (const p of body.query?.pages ?? []) categories.set(p.title, (p.categories ?? []).map((c) => c.title.replace(/^Category:/, "")));
}
const italianText = new Map<string, string>();
for (const r of italian) {
  const title = r.page_title.slice(3);
  const body = await query("it", { prop: "revisions", rvprop: "content", rvslots: "main", titles: title });
  italianText.set(r.page_title, body.query?.pages?.[0]?.revisions?.[0]?.slots.main.content ?? "");
}

const failing = rows.filter((r) =>
  r.page_title.startsWith("it:")
    ? !levelInText(italianText.get(r.page_title) ?? "", r.tournaments.category)
    : !levelFits(categories.get(r.page_title) ?? [], r.tournaments.tour, r.tournaments.category),
);
console.log(`checked ${rows.length} pairings (${italian.length} Italian), ${failing.length} fail the level rule`);
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

// Second rule: every visible result must come from its tournament's current draw page (results
// left over from an earlier, replaced pairing would double up the event).
const { data: strays, error: strayErr } = await db.rpc("stray_wiki_results");
if (strayErr) throw new Error(strayErr.message);
console.log(`${strays?.length ?? 0} tournaments show results from a page that isn't theirs`);
for (const s of strays ?? []) console.log(`  ${s.season} ${s.name}: ${s.results} results`);
if (fix && strays?.length) {
  const { data: hidden } = await db.rpc("hide_stray_wiki_results");
  console.log(`hid ${hidden ?? 0} stray results`);
}
