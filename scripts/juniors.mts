// Junior Slam results followed into the pros (weekly):  npm run juniors
import { createAdminClient } from "@/lib/supabase/admin";
import { computeJuniors } from "@/lib/sync/juniors";

const started = Date.now();
console.log(JSON.stringify(await computeJuniors(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
