// Store a season's tournaments (free tier):  npm run sync:tournaments -- 2025
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTournaments } from "@/lib/sync/matches";

const seasons = process.argv.slice(2).map(Number);
const db = createAdminClient();
for (const season of seasons) {
  for (const tour of ["atp", "wta"] as const) {
    const n = await syncTournaments(db, provider, tour, new Date(Date.UTC(season, 6, 1)));
    console.log(season, tour, n, "tournaments");
  }
}
