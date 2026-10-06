// Rankings rebuilt from results (weekly in the cron):  npm run rankings:rebuild -- [--full]
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRebuiltRankings } from "@/lib/sync/rebuilt-rankings";

const started = Date.now();
console.log(JSON.stringify(await computeRebuiltRankings(createAdminClient(), new Date(), process.argv.includes("--full"))), `${((Date.now() - started) / 1000).toFixed(1)}s`);
