// The rest of the season simulated (daily in the cron):  npm run season -- [--backtest]
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSeasonOutlook } from "@/lib/sync/season-outlook";

const started = Date.now();
console.log(JSON.stringify(await computeSeasonOutlook(createAdminClient(), new Date(), process.argv.includes("--backtest"))), `${((Date.now() - started) / 1000).toFixed(1)}s`);
