"use client";

import { useState } from "react";

import { arbitrage, expectedValue, fairMarket, kelly, parlay, parseOdds, toAmerican, toFractional } from "@/lib/bet-math";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const money = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;
const input = "w-full rounded-lg border border-border bg-background px-3 py-1.5 tabular-nums";

export interface CalcMatch {
  id: number;
  a: string;
  b: string;
  chanceA: number;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-t border-border py-1.5 first:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

/** Price check for a two-way match: margin, fair odds, expected value and Kelly against a chance. */
function PriceCheck({ match }: { match: CalcMatch | null }) {
  const [oddsA, setOddsA] = useState("");
  const [oddsB, setOddsB] = useState("");
  const [mine, setMine] = useState(match ? String(Math.round(match.chanceA * 1000) / 10) : "50");
  const [stake, setStake] = useState("10");
  const [bank, setBank] = useState("100");
  const a = parseOdds(oddsA);
  const b = parseOdds(oddsB);
  const p = Math.min(0.99, Math.max(0.01, Number(mine) / 100 || 0.5));
  const st = Math.max(0, Number(stake) || 0);
  const bk = Math.max(0, Number(bank) || 0);
  const names = [match?.a ?? "Player A", match?.b ?? "Player B"];
  const market = a && b ? fairMarket([a, b]) : null;
  const sides = [
    { name: names[0], d: a, p },
    { name: names[1], d: b, p: 1 - p },
  ];

  return (
    <Card title="Check a price">
      <div className="grid gap-3 sm:grid-cols-2">
        {sides.map((s, i) => (
          <label key={s.name} className="block text-sm">
            <span className="text-xs text-muted">{s.name}: odds (1.85, +150, −120 or 5/2)</span>
            <input value={i === 0 ? oddsA : oddsB} onChange={(e) => (i === 0 ? setOddsA : setOddsB)(e.target.value)} inputMode="text" className={`mt-1 ${input}`} />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-xs text-muted">
            {names[0]}’s chance to win, % {match ? "(our model’s, change it to your own)" : "(your estimate)"}
          </span>
          <input value={mine} onChange={(e) => setMine(e.target.value)} inputMode="decimal" className={`mt-1 ${input}`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-xs text-muted">Stake</span>
            <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className={`mt-1 ${input}`} />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted">Bankroll</span>
            <input value={bank} onChange={(e) => setBank(e.target.value)} inputMode="decimal" className={`mt-1 ${input}`} />
          </label>
        </div>
      </div>

      {market && (
        <dl className="text-sm">
          <Row label="Bookmaker margin (overround)" value={pct(market.margin)} strong />
        </dl>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map((s, i) =>
          s.d ? (
            <dl key={s.name} className="text-sm">
              <p className="mb-1 font-medium">{s.name}</p>
              <Row label="Decimal · American · Fractional" value={`${s.d.toFixed(2)} · ${toAmerican(s.d)} · ${toFractional(s.d)}`} />
              <Row label="Chance the price implies" value={pct(1 / s.d)} />
              {market && <Row label="Fair chance (margin removed)" value={`${pct(market.fair[i])} · fair odds ${market.fairOdds[i].toFixed(2)}`} />}
              <Row label="Chance you’re using" value={pct(s.p)} />
              <Row
                label={`Expected profit on ${money(st)}`}
                value={<span className={expectedValue(s.d, s.p) > 0 ? "text-up" : "text-down"}>{money(st * expectedValue(s.d, s.p))}</span>}
                strong
              />
              <Row label="Win needed to break even" value={pct(1 / s.d)} />
              <Row
                label="Kelly stake (full · half · quarter)"
                value={
                  kelly(s.d, s.p) > 0
                    ? `${money(bk * kelly(s.d, s.p))} · ${money((bk * kelly(s.d, s.p)) / 2)} · ${money((bk * kelly(s.d, s.p)) / 4)}`
                    : "No bet: no edge"
                }
              />
            </dl>
          ) : null,
        )}
      </div>
      <p className="text-xs text-muted">
        Expected profit is only as good as the chance you enter: if the bookmaker’s fair chance is closer to the truth, there is no
        edge. Full Kelly is very aggressive and assumes your chance is exactly right; most people who use it bet a quarter or less.
      </p>
    </Card>
  );
}

function Parlay() {
  const [legs, setLegs] = useState(["", ""]);
  const [stake, setStake] = useState("10");
  const decimals = legs.map(parseOdds).filter((d): d is number => d !== null);
  const result = decimals.length >= 2 ? parlay(decimals) : null;
  const st = Math.max(0, Number(stake) || 0);
  return (
    <Card title="Parlay (accumulator)">
      <ul className="space-y-2">
        {legs.map((leg, i) => (
          <li key={i} className="flex gap-2">
            <input
              aria-label={`Leg ${i + 1} odds`}
              value={leg}
              onChange={(e) => setLegs((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Leg ${i + 1} odds`}
              className={input}
            />
            {legs.length > 2 && (
              <button type="button" onClick={() => setLegs((l) => l.filter((_, j) => j !== i))} className="rounded-lg border border-border px-2.5 text-sm hover:bg-surface-muted" aria-label={`Remove leg ${i + 1}`}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => setLegs((l) => [...l, ""])} disabled={legs.length >= 12} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50">
          Add a leg
        </button>
        <label className="block text-sm">
          <span className="text-xs text-muted">Stake</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className={`mt-1 ${input} w-28`} />
        </label>
      </div>
      {result && (
        <dl className="text-sm">
          <Row label="Combined odds" value={`${result.odds.toFixed(2)} · ${toAmerican(result.odds)}`} strong />
          <Row label="Chance all legs win (implied)" value={pct(result.chance)} />
          <Row label={`Returns on ${money(st)} if all win`} value={money(st * result.odds)} />
        </dl>
      )}
      <p className="text-xs text-muted">
        Each leg carries the bookmaker’s margin, and the margins multiply: a parlay of four legs at 5% each has about a 20% margin. Legs
        from the same match are rarely independent, which the combined odds don’t account for.
      </p>
    </Card>
  );
}

function Arbitrage() {
  const [best, setBest] = useState(["", ""]);
  const [total, setTotal] = useState("100");
  const decimals = best.map(parseOdds);
  const ok = decimals.every((d): d is number => d !== null);
  const t = Math.max(0, Number(total) || 0);
  const r = ok ? arbitrage(decimals as number[], t) : null;
  return (
    <Card title="Arbitrage check">
      <p className="text-sm text-muted">The best price for each outcome, from different bookmakers.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {best.map((v, i) => (
          <label key={i} className="block text-sm">
            <span className="text-xs text-muted">Outcome {i + 1} best odds</span>
            <input value={v} onChange={(e) => setBest((b) => b.map((x, j) => (j === i ? e.target.value : x)))} className={`mt-1 ${input}`} />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-xs text-muted">Total to stake</span>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" className={`mt-1 ${input}`} />
        </label>
      </div>
      {r && (
        <dl className="text-sm">
          <Row label="Implied chances add up to" value={pct(r.sum)} strong />
          {r.arb ? (
            <>
              {r.stakes.map((s, i) => (
                <Row key={i} label={`Stake on outcome ${i + 1}`} value={money(s)} />
              ))}
              <Row label="Return whatever happens" value={`${money(r.payout)} (profit ${money(r.profit)})`} strong />
            </>
          ) : (
            <Row label="Arbitrage" value={`None: the prices need to improve by ${pct(r.sum - 1)} in total`} />
          )}
        </dl>
      )}
      <p className="text-xs text-muted">
        Real arbitrage is rare and short-lived; prices move, bets get voided or limited, and accounts that only take arbitrage are often
        restricted. Tennis retirements are settled differently by different bookmakers, which can break an arbitrage.
      </p>
    </Card>
  );
}

/** Betting arithmetic: price check against a chance, parlays and arbitrage. Runs only in the browser. */
export function BetCalculator({ match }: { match: CalcMatch | null }) {
  return (
    <div className="space-y-4">
      <PriceCheck match={match} />
      <Parlay />
      <Arbitrage />
    </div>
  );
}
