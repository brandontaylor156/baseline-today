// Career comparables and their backtests (weekly in the daily cron):  npm run projections
import { createAdminClient } from "@/lib/supabase/admin";
import { computeProjections } from "@/lib/sync/projections";

const started = Date.now();
console.log(JSON.stringify(await computeProjections(createAdminClient())), `${((Date.now() - started) / 1000).toFixed(1)}s`);
