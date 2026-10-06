// Recomputes the research lab (title chances for every rebuilt draw, weekly ratings):  npm run lab:compute
import { createAdminClient } from "@/lib/supabase/admin";
import { computeLab } from "@/lib/sync/lab";

console.log(JSON.stringify(await computeLab(createAdminClient())));
