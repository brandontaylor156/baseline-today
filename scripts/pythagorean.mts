// The deserved record from games won, and the next-season test (weekly):  npm run pythagorean
import { createAdminClient } from "@/lib/supabase/admin";
import { computePythagorean } from "@/lib/sync/pythagorean";

const started = Date.now();
console.log(JSON.stringify(await computePythagorean(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
