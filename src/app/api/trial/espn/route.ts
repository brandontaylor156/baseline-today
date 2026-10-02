import { trialSamplingEnabled } from "@/lib/features";
import { TOURS } from "@/lib/provider/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sampleEspn } from "@/lib/trial/espn";

// Trial only (TRIAL_SAMPLING=1): reference timings for the lag report. Lock-bounded per tour.
export async function GET() {
  if (!trialSamplingEnabled()) return new Response("Not found", { status: 404 });
  const db = createAdminClient();
  const results = await Promise.all(TOURS.map((tour) => sampleEspn(db, tour)));
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
