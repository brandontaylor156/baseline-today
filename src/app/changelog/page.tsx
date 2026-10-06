import type { Metadata } from "next";

import changelog from "@/data/changelog.json";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Everything that has shipped on Baseline Today, newest first, from the project's commit history.",
};

const REPO = "https://github.com/brandontaylor156/baseline-today";
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

type Entry = { hash: string; date: string; subject: string; bullets: string[] };

export default function ChangelogPage() {
  const byDay = new Map<string, Entry[]>();
  for (const e of changelog as Entry[]) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Changelog</h1>
        <p className="text-sm text-muted">
          Every change, newest first, from the{" "}
          <a href={`${REPO}/commits/main`} className="underline underline-offset-2">
            commit history
          </a>
          . {changelog.length} commits.
        </p>
      </header>
      {[...byDay.entries()].map(([date, entries]) => (
        <section key={date} aria-labelledby={`d-${date}`} className="space-y-3">
          <h2 id={`d-${date}`} className="sticky top-0 bg-background py-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {day(date)}
          </h2>
          <ul className="space-y-4">
            {entries.map((e) => (
              <li key={e.hash} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-medium">
                  {e.subject}{" "}
                  <a href={`${REPO}/commit/${e.hash}`} className="font-mono text-xs font-normal text-muted hover:underline">
                    {e.hash}
                  </a>
                </p>
                {e.bullets.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                    {e.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
