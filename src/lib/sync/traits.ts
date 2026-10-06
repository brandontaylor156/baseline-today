import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";

// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";
const LEFT = "Q789447"; // left-handedness
const RIGHT = ["Q3039938", "Q14419931"]; // right-handedness; "one-handed forehand" as some items record it
const ONE_HANDED_BACKHAND = "Q14420039";
const TWO_HANDED_BACKHAND = "Q14420068";
const CENTIMETRE = "Q174728";
const METRE = "Q11573";

type Claim = { mainsnak: { datavalue?: { value: unknown } } };
export type Traits = { hand: "left" | "right" | null; backhand: "one" | "two" | null; height: number | null };

const plausible = (cm: number | null) => (cm !== null && cm > 140 && cm < 225 ? Math.round(cm) : null);

/** Hand, backhand and height as Wikidata records them (pure). */
export function traitsFrom(claims: Record<string, Claim[]> | undefined): Traits {
  const ids = (p: string) => (claims?.[p] ?? []).map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id).filter(Boolean) as string[];
  const hand = ids("P741");
  let height: number | null = null;
  for (const c of claims?.P2048 ?? []) {
    const v = c.mainsnak.datavalue?.value as { amount?: string; unit?: string } | undefined;
    const amount = Number(v?.amount);
    const unit = v?.unit?.split("/").pop();
    height = plausible(!Number.isFinite(amount) ? null : unit === CENTIMETRE ? amount : unit === METRE ? amount * 100 : null);
    if (height) break;
  }
  return {
    hand: hand.includes(LEFT) ? "left" : hand.some((h) => RIGHT.includes(h)) ? "right" : null,
    backhand: hand.includes(ONE_HANDED_BACKHAND) ? "one" : hand.includes(TWO_HANDED_BACKHAND) ? "two" : null,
    height,
  };
}

/** Hand, backhand and height from a Wikipedia tennis infobox ("Right-handed (two-handed backhand)", "1.85 m"). Pure. */
export function traitsFromInfobox(wikitext: string): Traits {
  const field = (name: string) => wikitext.match(new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`, "i"))?.[1] ?? "";
  const plays = field("plays").toLowerCase().replace(/[‐-―]/g, "-");
  const hand = /left[- ]handed/.test(plays) ? "left" : /right[- ]handed/.test(plays) ? "right" : null;
  const backhand = /one[- ]handed/.test(plays) && /backhand/.test(plays) ? "one" : /two[- ]handed/.test(plays) && /backhand/.test(plays) ? "two" : null;
  const h = field("height").replace(/<ref[\s\S]*$/i, "");
  const metres = h.match(/(\d\.\d{1,2})\s*\|?\s*m\b/);
  const cms = h.match(/(\d{3})\s*\|?\s*cm/) ?? h.match(/cm\s*=\s*(\d{3})/);
  return { hand, backhand, height: plausible(metres ? Number(metres[1]) * 100 : cms ? Number(cms[1]) : null) };
}

/** The lead of an article (where the infobox sits): everything before the first section heading. */
const lead = (content: string) => {
  const cut = content.search(/\n==[^=]/);
  return cut > 0 ? content.slice(0, cut) : content.slice(0, 30000);
};

/**
 * Hand, backhand and height for every player with a Wikidata item: Wikidata first (CC0), then the
 * player's English Wikipedia infobox (the item links the exact article) for whatever Wikidata
 * leaves empty. Weekly, for players not checked in 90 days; `limit` caps a run.
 */
export async function syncTraits(db: AdminClient, limit = 5000): Promise<string> {
  const items: { player_key: string; tour: string; wikidata_id: string }[] = [];
  const { data: linked, error } = await db.from("players").select("id, tour, wikidata_id").not("wikidata_id", "is", null);
  if (error) throw new Error(`traits: players: ${error.message}`);
  for (const p of linked ?? []) items.push({ player_key: `id:${p.id}`, tour: p.tour, wikidata_id: p.wikidata_id! });
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("lab_people").select("player_key, tour, wikidata_id").not("wikidata_id", "is", null).range(from, from + 999);
    if (e) throw new Error(`traits: people: ${e.message}`);
    for (const p of data ?? []) items.push({ player_key: p.player_key, tour: p.tour, wikidata_id: p.wikidata_id! });
    if (!data || data.length < 1000) break;
  }
  // New players first; anyone checked in the last 90 days is skipped.
  const checked = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("player_traits").select("player_key, checked_at").range(from, from + 999);
    if (e) throw new Error(`traits: known: ${e.message}`);
    for (const t of data ?? []) checked.set(t.player_key, t.checked_at);
    if (!data || data.length < 1000) break;
  }
  const stale = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const todo = items.filter((c) => (checked.get(c.player_key) ?? "") < stale).slice(0, limit);
  let hands = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const params = new URLSearchParams({ action: "wbgetentities", ids: chunk.map((c) => c.wikidata_id).join("|"), props: "claims|sitelinks", sitefilter: "enwiki", format: "json" });
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) throw new Error(`traits: Wikidata HTTP ${res.status}`);
    const body = (await res.json()) as { entities?: Record<string, { claims?: Record<string, Claim[]>; sitelinks?: { enwiki?: { title: string } } }> };

    // The infoboxes, for the gaps.
    const titles = chunk.map((c) => body.entities?.[c.wikidata_id]?.sitelinks?.enwiki?.title).filter((t): t is string => Boolean(t));
    const boxes = new Map<string, string>();
    for (let j = 0; j < titles.length; j += 20) {
      const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions", rvprop: "content", rvslots: "main", titles: titles.slice(j, j + 20).join("|") });
      const r = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
      if (!r.ok) continue;
      const pages = ((await r.json()) as { query?: { pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } }).query?.pages ?? [];
      for (const p of pages) boxes.set(p.title, lead(p.revisions?.[0]?.slots.main.content ?? ""));
    }

    const rows = chunk.map((c) => {
      const entity = body.entities?.[c.wikidata_id];
      const t = traitsFrom(entity?.claims);
      const article = entity?.sitelinks?.enwiki?.title ?? null;
      const box: Traits = article ? traitsFromInfobox(boxes.get(article) ?? "") : { hand: null, backhand: null, height: null };
      const fromWikipedia = Boolean((!t.hand && box.hand) || (!t.backhand && box.backhand) || (!t.height && box.height));
      const hand = t.hand ?? box.hand;
      if (hand) hands++;
      return {
        player_key: c.player_key,
        tour: c.tour,
        wikidata_id: c.wikidata_id,
        hand,
        backhand: t.backhand ?? box.backhand,
        height_cm: t.height ?? box.height,
        source: fromWikipedia ? "wikipedia" : "wikidata",
        article,
        checked_at: new Date().toISOString(),
      };
    });
    const { error: e } = await db.from("player_traits").upsert(rows, { onConflict: "player_key" });
    if (e) throw new Error(`traits: save: ${e.message}`);
  }
  return `${todo.length} checked, ${hands} with a playing hand`;
}
