import type { Metadata } from "next";
import Link from "next/link";

import { BetCalculator, type CalcMatch } from "@/components/bet-calculator";
import { getMatchPreview } from "@/lib/data/match-preview";

export const metadata: Metadata = {
  title: "Betting maths calculator",
  description:
    "Free tennis betting calculator: convert odds, find the bookmaker's margin and fair odds, expected value against our model, Kelly stakes, parlays and arbitrage.",
};

export default async function BettingToolPage({ searchParams }: PageProps<"/tools/betting">) {
  const { match } = await searchParams;
  let calc: CalcMatch | null = null;
  if (typeof match === "string" && /^\d{1,9}$/.test(match)) {
    const m = await getMatchPreview(Number(match));
    if (m && m.chanceA !== null) calc = { id: Number(match), a: m.a.name, b: m.b.name, chanceA: m.chanceA };
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Betting maths calculator</h1>
        <p className="text-sm text-muted">
          The arithmetic behind a price: what it implies, how much the bookmaker keeps, and whether it’s worth anything against a chance
          you trust. Everything runs in your browser; nothing is stored.
          {calc && (
            <>
              {" "}
              Filled in from{" "}
              <Link href={`/matches/${calc.id}`} className="underline underline-offset-2">
                {calc.a} vs {calc.b}
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <aside className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
        <p>
          <strong>Before you bet:</strong> bookmakers build a margin into every price, so most bettors lose over time. Our model is an
          estimate and is not better than the market; no calculator turns betting into income. Betting is for adults only (18+, 21+ in
          some places). If gambling stops being fun, help is free and confidential:{" "}
          <a href="https://www.ncpgambling.org/help-treatment/" className="underline underline-offset-2">
            1-800-GAMBLER
          </a>
          .
        </p>
      </aside>
      <BetCalculator match={calc} />
      <section aria-labelledby="formulas-heading" className="space-y-2 text-sm">
        <h2 id="formulas-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          The formulas
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Implied chance = 1 ÷ decimal odds. American +150 = 2.50 decimal; −120 = 1.83; fractional 5/2 = 3.50.</li>
          <li>Margin = (sum of implied chances) − 1. Fair chance = implied chance ÷ that sum (the proportional method).</li>
          <li>Expected profit per 1 staked = chance × (odds − 1) − (1 − chance). Positive only when your chance beats the price.</li>
          <li>Kelly fraction = (b × p − q) ÷ b, where b = odds − 1, p = your chance and q = 1 − p.</li>
          <li>Parlay odds = the product of each leg’s decimal odds. Arbitrage exists when the best prices’ implied chances sum below 100%.</li>
        </ul>
      </section>
    </div>
  );
}
