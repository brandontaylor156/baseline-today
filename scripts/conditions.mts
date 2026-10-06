// Heat, retirements, jet lag and altitude from real weather and venues (weekly):  npm run conditions
import { createAdminClient } from "@/lib/supabase/admin";
import { computeConditions } from "@/lib/sync/conditions-analysis";

const started = Date.now();
console.log(JSON.stringify(await computeConditions(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
