// Recomputes "if a major started today" for both tours:  npm run forecast
import { createAdminClient } from "@/lib/supabase/admin";
import { computeForecast } from "@/lib/sync/forecast";

const started = Date.now();
console.log(JSON.stringify({ ...(await computeForecast(createAdminClient())), seconds: Math.round((Date.now() - started) / 1000) }));
