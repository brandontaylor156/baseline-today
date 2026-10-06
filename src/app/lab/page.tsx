import type { Metadata } from "next";
import Link from "next/link";

import { getLuck, getTitleExtremes } from "@/lib/data/lab";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Research lab",
  description:
    "Tennis analytics built from every result since 2015: expected vs actual titles, the most improbable champions, cross-era matchups, aging curves and a results explorer.",
};

const TOOLS = [
  {
    href: "/lab/season",
    title: "Season simulator",
    text: "The rest of the season played out thousands of times, every event and draw: each player's chance of the Finals, year-end No. 1 and the top 10. Backtested on 2025.",
  },
  {
    href: "/lab/forecast",
    title: "If a Grand Slam started today",
    text: "Hundreds of 128-player draws made with real seeding rules, each solved exactly: every player's chance on hard, clay and grass, updated daily.",
  },
  {
    href: "/lab/greatest",
    title: "The greatest matches since 2015",
    text: "Every match scored for strength, drama and stakes: Alcaraz–Sinner at Roland Garros 2025 tops the decade. The best of each season too.",
  },
  {
    href: "/lab/form",
    title: "Who’s in form",
    text: "Wins over the last 30, 60 or 90 days against what the model expected from each matchup: the hottest and coldest players right now.",
  },
  {
    href: "/lab/luck",
    title: "Expected vs actual titles",
    text: "Every draw since 2015 rebuilt from its results and replayed with the ratings of that week. Who won more titles than their chances said, and the most improbable champions.",
  },
  {
    href: "/lab/in-the-way",
    title: "Who stood in whose way",
    text: "Every draw replayed without each contender: how many titles Alcaraz cost Sinner, Djokovic cost Medvedev, Swiatek cost Sabalenka, and who cost the whole field the most.",
  },
  {
    href: "/lab/clutch",
    title: "Clutch index",
    text: "Tiebreaks and deciding sets won against what a point-level model expected for each matchup, over every match since 2015.",
  },
  {
    href: "/lab/explorer",
    title: "Results explorer",
    text: "Any player’s matches filtered by opponent, surface, season, round, event, favourite or underdog, deciding sets and tiebreaks, with splits and CSV export.",
  },
  {
    href: "/lab/dream-draw",
    title: "Dream draw",
    text: "Any 8 or 16 players, today or at their peak, in a seeded draw on any surface: exact chances to reach every round.",
  },
  {
    href: "/lab/time-machine",
    title: "Time machine",
    text: "Two players at any point in their careers, on any surface: the model’s verdict. Plus every player’s peak rating since 2015.",
  },
  {
    href: "/lab/similar",
    title: "Similar players",
    text: "Who a player’s results most resemble: surface strengths, tiebreaks, deciding sets, comebacks, and how they fare as favourite or underdog.",
  },
  {
    href: "/lab/comparables",
    title: "Career comparables",
    text: "Each player's last two years matched against every earlier player at the same age: who was on the same road, what became of them, and a backtested range for what's next.",
  },
  {
    href: "/lab/aging",
    title: "Aging curves",
    text: "How much players improve from one age to the next, measured on the same players against their field, and where today’s young players are headed.",
  },
];

export default async function LabPage() {
  const [luck, longshot] = await Promise.all([getLuck("atp"), getTitleExtremes("atp", true, 1)]);
  const over = [...luck].sort((a, b) => b.titles - b.expected - (a.titles - a.expected))[0];
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-accent">Research lab</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tennis, replayed</h1>
        <p className="mt-2 text-muted">
          We replayed every tracked result since 2015 through our rating model, rebuilt 1,100+ draws from their results alone, and
          computed every entrant’s chance of winning before the first ball. These tools are what that makes possible.
        </p>
      </div>

      {(over || longshot[0]) && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {over && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">Most titles above expectation (ATP)</dt>
              <dd className="text-xl font-semibold">
                {over.name}: {over.titles} won, {over.expected.toFixed(1)} expected
              </dd>
            </div>
          )}
          {longshot[0] && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">Most improbable ATP title</dt>
              <dd className="text-xl font-semibold">
                {longshot[0].name}, {longshot[0].tournament} {longshot[0].season}
              </dd>
            </div>
          )}
        </dl>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block h-full rounded-xl border border-border bg-surface p-5 hover:border-accent">
              <span className="text-lg font-semibold">{t.title} →</span>
              <span className="mt-1 block text-sm text-muted">{t.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Built from Wikipedia draw pages (CC BY-SA 4.0) and the site’s surface-aware Elo model. Counts cover tracked draws only. Recomputed
        weekly. <Link href="/model" className="underline underline-offset-2">How accurate is the model?</Link>
      </p>
    </div>
  );
}
