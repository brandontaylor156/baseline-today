// Draw-integrity audit of every stored bracket (weekly):  npm run draw:audit -- [--full]
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDrawAudit } from "@/lib/sync/draw-audit";

const started = Date.now();
console.log(await computeDrawAudit(createAdminClient(), new Date(), process.argv.includes("--full")), `${((Date.now() - started) / 1000).toFixed(1)}s`);
