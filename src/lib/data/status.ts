import "server-only";

import { JOBS, jobHealth, type Health } from "@/lib/ops";
import type { Tour } from "@/lib/provider/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";

export interface JobStatus {
  key: string;
  label: string;
  every: string;
  health: Health;
  lastSuccess: string | null;
  detail: string | null;
  error: string | null;
}

export interface SiteStatus {
  jobs: JobStatus[];
  rankingDates: { tour: Tour; date: string }[];
  latestResultAt: string | null;
  strayResults: number | null;
  modelMatches: number | null;
}

type Details = Record<string, unknown> | null;

function jobDetail(key: string, details: Details): string | null {
  if (!details) return null;
  if (key === "results" && typeof details.results === "number") {
    const pages = Number(details.pagesChanged ?? 0);
    return pages === 0
      ? "no draw pages changed on the last run"
      : `last run: ${pages} draw ${pages === 1 ? "page" : "pages"} changed, ${details.results} results saved`;
  }
  if (key === "daily" && typeof details.ms === "number") return `last run took ${Math.round(details.ms / 1000)} s`;
  if (key === "model") {
    const backtest = details.backtest as Record<string, { n: number; brier: number }> | undefined;
    const atp = backtest?.atp;
    return atp ? `Brier score ${atp.brier.toFixed(3)} on ${atp.n.toLocaleString("en-US")} held-out ATP matches` : null;
  }
  return null;
}

/** Freshness of every background job and of the data they write, read fresh on each visit. */
export async function getSiteStatus(now = new Date()): Promise<SiteStatus> {
  const db = createPublicClient({ cached: false });
  const [state, latest, stray] = await Promise.all([
    db.from("sync_state").select("key, last_refreshed_at, status, details").in("key", JOBS.map((j) => j.key)),
    db
      .from("matches")
      .select("updated_at")
      .eq("status", "final")
      .eq("confirmed", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Results shown under a tournament but taken from another draw page (server-only audit).
    createAdminClient().rpc("stray_wiki_results"),
  ]);
  if (state.error) throw new Error(`status: ${state.error.message}`);

  const rows = new Map(state.data.map((r) => [r.key, r]));
  const jobs = JOBS.map((job): JobStatus => {
    const row = rows.get(job.key);
    const details = (row?.details ?? null) as Details;
    return {
      key: job.key,
      label: job.label,
      every: job.every,
      health: jobHealth(row, job.staleMinutes, now),
      lastSuccess: row?.last_refreshed_at ?? null,
      detail: jobDetail(job.key, details),
      error: row?.status === "error" && typeof details?.error === "string" ? details.error : null,
    };
  });

  const daily = (rows.get("daily")?.details ?? null) as { tours?: { tour: Tour; rankingDate?: string }[] } | null;
  const model = (rows.get("model")?.details ?? null) as { summary?: Record<string, { matches: number }> } | null;
  return {
    jobs,
    rankingDates: (daily?.tours ?? []).filter((t) => t.rankingDate).map((t) => ({ tour: t.tour, date: t.rankingDate! })),
    latestResultAt: latest.data?.updated_at ?? null,
    strayResults: stray.error ? null : stray.data.reduce((sum, r) => sum + Number(r.results), 0),
    modelMatches: model?.summary ? Object.values(model.summary).reduce((sum, t) => sum + t.matches, 0) : null,
  };
}
