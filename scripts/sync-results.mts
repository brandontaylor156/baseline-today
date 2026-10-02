// Wikipedia results:  npm run sync:results            (refresh tournaments in play)
//                     npm run sync:results -- backfill 2026   (import a whole season once)
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillResults, refreshResults } from "@/lib/sync/wiki-results";

const db = createAdminClient();
const [mode, season] = process.argv.slice(2);
const started = Date.now();
const result = mode === "backfill" ? await backfillResults(db, Number(season ?? new Date().getUTCFullYear())) : await refreshResults(db);
console.log(JSON.stringify({ ...result, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
