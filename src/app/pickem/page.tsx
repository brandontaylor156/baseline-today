import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PickemBoard, type PickemMatch } from "@/components/pickem-board";
import { getModelInfo, getUpcoming } from "@/lib/data/predictions";
import { displayName } from "@/lib/data/tournaments";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Pick'em",
  description: "Pick the winners of upcoming ATP and WTA matches and see how you do against our model.",
};

/** Monday of this week (UTC). */
function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

type Row = { name: string; is_me: boolean; correct: number; settled: number; model_correct: number };

function Leaderboard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No named players with settled picks yet.</p>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.name} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">model {r.model_correct}</span>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                {r.correct}/{r.settled}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function PickemPage() {
  await connection();
  const now = new Date();
  const week = weekStart(now);
  const season = `${now.getUTCFullYear()}-01-01`;
  const db = createPublicClient({ cached: false });
  const [{ matchups }, weekBoard, seasonBoard, info] = await Promise.all([
    getUpcoming(now),
    db.rpc("pickem_leaderboard", { p_since: week }),
    db.rpc("pickem_leaderboard", { p_since: season }),
    getModelInfo(),
  ]);
  const open: PickemMatch[] = matchups
    .filter((m) => !m.scheduledAt || Date.parse(m.scheduledAt) > now.getTime())
    .map((m) => ({
      id: m.id,
      tournament: displayName(m.tournament.name),
      round: m.round,
      p1: { name: m.p1.name, countryCode: m.p1.countryCode },
      p2: { name: m.p2.name, countryCode: m.p2.countryCode },
      model1: m.model1,
    }));
  const model = ["atp", "wta"].map((t) => info.backtest[t]).filter(Boolean);
  const modelRate = model.length ? model.reduce((s, b) => s + b!.accuracy * b!.n, 0) / model.reduce((s, b) => s + b!.n, 0) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pick’em</h1>
        <p className="text-sm text-muted">
          Pick the winner of upcoming matches and see if you can beat our model
          {modelRate ? `, which picks the favorite and gets about ${Math.round(modelRate * 100)}% right` : ""}. Just for fun: no prizes, no
          money.
        </p>
        <p className="mt-1 text-sm">
          <Link href="/leagues" className="font-medium text-accent hover:underline">
            Private leagues →
          </Link>{" "}
          <span className="text-muted">· Bracket Challenge opens on each tournament page before the first result.</span>
        </p>
      </div>

      <section aria-label="Leaderboards" className="grid gap-3 sm:grid-cols-2">
        <Leaderboard title="This week" rows={(weekBoard.data ?? []) as Row[]} />
        <Leaderboard title="This season" rows={(seasonBoard.data ?? []) as Row[]} />
      </section>

      <section aria-labelledby="open-heading" className="space-y-2">
        <h2 id="open-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Open matches · {open.length}
        </h2>
        <PickemBoard matches={open} weekStart={week} seasonStart={season} />
        <p className="text-xs text-muted">
          Picks close when the result is posted, or at the start time when we know it. Walkovers don’t count. “Model” is our model’s
          record on the same matches (its pre-match favorite), updated daily. Percentages on the buttons are the model’s chances.
        </p>
      </section>
    </div>
  );
}
