// Job health for the status page and failure alerts. Pure functions plus one webhook sender.

/** Background jobs recorded in sync_state, and how often each should succeed. */
export const JOBS = [
  { key: "results", label: "Results from Wikipedia", every: "every 10 minutes", staleMinutes: 60 },
  { key: "daily", label: "Daily rankings sync", every: "daily at 06:00 UTC", staleMinutes: 26 * 60 },
  { key: "model", label: "Rating model", every: "with the daily sync", staleMinutes: 26 * 60 },
] as const;

export type JobKey = (typeof JOBS)[number]["key"];
export type Health = "ok" | "stale" | "error" | "never";

export interface SyncRow {
  key: string;
  last_refreshed_at: string | null;
  status: string | null;
}

/** A job is healthy when its last run succeeded and the last success is recent enough. */
export function jobHealth(row: SyncRow | undefined, staleMinutes: number, now: Date): Health {
  if (!row?.last_refreshed_at) return row?.status === "error" ? "error" : "never";
  if (row.status === "error") return "error";
  const ageMinutes = (now.getTime() - Date.parse(row.last_refreshed_at)) / 60_000;
  return ageMinutes > staleMinutes ? "stale" : "ok";
}

/** "4 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * Whether a job's new status deserves an alert: on failure, and on recovery after one, but not
 * on every run of a job that keeps failing (the results job runs every 10 minutes).
 */
export function alertFor(job: string, before: string | null | undefined, after: string, detail?: string): string | null {
  if (after === "error" && before !== "error") return `⚠️ Baseline Today: ${job} failed${detail ? `: ${detail}` : ""}`;
  if (after === "ok" && before === "error") return `✅ Baseline Today: ${job} recovered`;
  return null;
}
