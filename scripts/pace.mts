// Court pace from scorelines (weekly):  npm run pace
import { createAdminClient } from "@/lib/supabase/admin";
import { computePace } from "@/lib/sync/pace";

const started = Date.now();
console.log(JSON.stringify(await computePace(createAdminClient())), `${((Date.now() - started) / 1000).toFixed(1)}s`);
