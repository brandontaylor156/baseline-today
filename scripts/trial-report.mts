// Trial report from the measurements in Supabase:  npm run trial:report
import { createAdminClient } from "@/lib/supabase/admin";
import { coverage, gameLags, quantile, summarizePolls, updateIntervals, type Observation, type Poll } from "@/lib/trial/report";

const db = createAdminClient();

async function all<T>(table: "trial_polls" | "trial_observations"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

const fmt = (n: number | null, unit = "s") => (n === null ? "–" : `${Math.round(n * 10) / 10}${unit}`);
const dist = (xs: number[], unit = "s") =>
  `median ${fmt(quantile(xs, 0.5), unit)} · p10 ${fmt(quantile(xs, 0.1), unit)} · p90 ${fmt(quantile(xs, 0.9), unit)} · n=${xs.length}`;

const [polls, obs] = await Promise.all([all<Poll>("trial_polls"), all<Observation>("trial_observations")]);
const first = polls[0]?.polled_at;
const last = polls.at(-1)?.polled_at;

console.log(`# Trial measurements\n`);
console.log(`Window: ${first ?? "–"} → ${last ?? "–"} (${polls.length} polls, ${obs.length} observations)\n`);

console.log(`## Polls`);
for (const s of summarizePolls(polls)) {
  console.log(
    `- ${s.key}: ${s.ok}/${s.polls} ok, ${s.rateLimited} rate-limited, ${s.unauthorized} unauthorized, median latency ${fmt(s.medianLatencyMs, "ms")}, max live ${s.maxLive}`,
  );
}

console.log(`\n## Provider update cadence (time between changes of a live match)`);
console.log(`- all changes: ${dist(updateIntervals(obs))}`);

const lags = gameLags(obs);
console.log(`\n## Provider lag behind ESPN (games level; positive = provider later)`);
console.log(`- ${dist(lags)}`);
console.log(`- provider first: ${lags.filter((l) => l < 0).length} · within ±30s: ${lags.filter((l) => Math.abs(l) <= 30).length}`);
console.log(`- note: both sources are polled every ~20s, so each lag carries up to ±20s of polling noise.`);

const c = coverage(obs);
console.log(`\n## Coverage (live singles matches seen)`);
console.log(`- provider ${c.provider} · ESPN ${c.reference} · both ${c.both}`);
if (c.referenceOnly.length) console.log(`- seen only on ESPN: ${c.referenceOnly.slice(0, 20).join(", ")}`);
