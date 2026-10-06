// Who breaks through to the tour (weekly):  npm run breakthrough
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBreakthrough } from "@/lib/sync/breakthrough";

const started = Date.now();
console.log(await computeBreakthrough(createAdminClient()), `${((Date.now() - started) / 1000).toFixed(1)}s`);
