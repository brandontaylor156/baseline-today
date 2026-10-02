// Backtest the Elo model: ratings warm up on earlier seasons; a calibration factor is fitted on the
// previous season and tested on the test season, predicting every match using only what was known
// before it.   npm run model:backtest [-- 2026]
import { calibrate, evaluate, fitCalibration, runElo } from "@/lib/model/elo";
import { loadResults } from "@/lib/model/load";
import { createAdminClient } from "@/lib/supabase/admin";

const testSeason = Number(process.argv[2] ?? new Date().getUTCFullYear());
const all = await loadResults(createAdminClient());
const seasonOf = new Map(all.map((m) => [m.order, m.season]));
console.log(`loaded ${all.length} results`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const tour of ["atp", "wta"] as const) {
  const { predictions } = runElo(all.filter((m) => m.tour === tour));
  const fitOn = predictions.filter((p) => seasonOf.get(p.match.order) === testSeason - 1);
  const c = fitCalibration(fitOn);
  const test = predictions.filter((p) => seasonOf.get(p.match.order) === testSeason);
  const raw = evaluate(test);
  const cal = evaluate(test.map((p) => ({ ...p, p1: calibrate(p.p1, c) })));
  console.log(`\n${tour.toUpperCase()} ${testSeason}: n=${raw.n}  favourite won ${pct(raw.accuracy)}  calibration factor ${c.toFixed(2)} (fitted on ${testSeason - 1})`);
  console.log(`  log-loss ${raw.logLoss.toFixed(3)} → ${cal.logLoss.toFixed(3)}   Brier ${raw.brier.toFixed(3)} → ${cal.brier.toFixed(3)}`);
  for (const b of cal.calibration) console.log(`    ${b.bucket.padEnd(9)} n=${String(b.n).padStart(4)}  predicted ${pct(b.predicted)}  actual ${pct(b.actual)}`);
}
