// Run the daily sync locally against the database in .env.local:  npm run sync:daily
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailySync } from "@/lib/sync/daily";

const result = await runDailySync(createAdminClient(), provider);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === "error" ? 1 : 0;
