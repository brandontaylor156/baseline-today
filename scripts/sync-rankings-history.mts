// Backfill weekly rankings:  npm run sync:rankings-history -- 2025-01-01 2026-09-30
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillRankings } from "@/lib/sync/rankings-history";

const [from = "2025-01-01", to = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const db = createAdminClient();
const results = await Promise.all(
  (["atp", "wta"] as const).map((tour) => backfillRankings(db, provider, tour, from, to, console.log, 12_500)),
);
console.log(JSON.stringify(results));
