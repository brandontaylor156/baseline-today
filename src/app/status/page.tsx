import type { Metadata } from "next";
import { connection } from "next/server";

import { getSiteStatus } from "@/lib/data/status";
import { formatDate, TOUR_LABEL } from "@/lib/format";
import { ago, type Health } from "@/lib/ops";

export const metadata: Metadata = {
  title: "Status",
  description: "When each background job last ran, and how fresh the rankings, results and ratings are.",
};

const HEALTH: Record<Health, { label: string; className: string }> = {
  ok: { label: "Healthy", className: "text-up" },
  stale: { label: "Behind", className: "text-warn" },
  error: { label: "Failing", className: "text-down" },
  never: { label: "Not run yet", className: "text-muted" },
};

export default async function StatusPage() {
  await connection();
  const now = new Date();
  const status = await getSiteStatus(now);
  const healthy = status.jobs.every((j) => j.health === "ok");

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Status</h1>
        <p className={`font-medium ${healthy ? "text-up" : "text-warn"}`}>
          {healthy ? "All background jobs are running on schedule." : "Some data may be out of date."}
        </p>
        <p className="text-sm text-muted">
          Pages never call the data providers. Background jobs copy rankings and results into the database, and every
          page reads from there. This page shows when each job last succeeded. Failures post an alert to the site
          owner.
        </p>
      </header>

      <section aria-labelledby="jobs-heading" className="space-y-3">
        <h2 id="jobs-heading" className="text-lg font-semibold">
          Background jobs
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {status.jobs.map((job) => (
            <li key={job.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{job.label}</p>
                <p className="text-sm text-muted">
                  Runs {job.every}
                  {job.detail ? ` · ${job.detail}` : ""}
                </p>
                {job.error ? <p className="break-words text-sm text-down">Last error: {job.error}</p> : null}
              </div>
              <div className="text-right text-sm">
                <p className={`font-medium ${HEALTH[job.health].className}`}>{HEALTH[job.health].label}</p>
                <p className="text-muted">
                  {job.lastSuccess ? (
                    <time dateTime={job.lastSuccess} title={job.lastSuccess}>
                      {ago(job.lastSuccess, now)}
                    </time>
                  ) : (
                    "never"
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data-heading" className="space-y-3">
        <h2 id="data-heading" className="text-lg font-semibold">
          Data
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {status.rankingDates.map((r) => (
            <Stat key={r.tour} label={`${TOUR_LABEL[r.tour]} rankings`} value={`Week of ${formatDate(r.date)}`} />
          ))}
          <Stat
            label="Latest result recorded"
            value={status.latestResultAt ? ago(status.latestResultAt, now) : "None yet"}
          />
          {status.modelMatches !== null ? (
            <Stat label="Matches behind the ratings" value={status.modelMatches.toLocaleString("en-US")} />
          ) : null}
          {status.strayResults !== null ? (
            <Stat
              label="Results failing the source check"
              value={status.strayResults === 0 ? "None" : status.strayResults.toLocaleString("en-US")}
            />
          ) : null}
        </dl>
      </section>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
