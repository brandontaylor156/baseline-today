// One-off history import: tournaments and Wikipedia results for past seasons, newest first.
// Resumable (found pages aren't downloaded again).
//   npx tsx --env-file=.env.local --conditions=react-server scripts/import-history.mts 2023 2015
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTournaments } from "@/lib/sync/matches";
import { backfillResults, relinkPlayers } from "@/lib/sync/wiki-results";

const [from, to] = process.argv.slice(2).map(Number);
const db = createAdminClient();
const started = Date.now();
const log = (...a: unknown[]) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...a);

for (let season = from; season >= to; season--) {
  for (const tour of ["atp", "wta"] as const) {
    const n = await syncTournaments(db, provider, tour, new Date(Date.UTC(season, 6, 1)));
    log(season, tour, n, "tournaments");
  }
  const r = await backfillResults(db, season);
  log(season, "results", JSON.stringify(r));
}
log("relinked", await relinkPlayers(db));
