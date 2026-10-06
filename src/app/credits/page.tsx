import type { Metadata } from "next";
import Link from "next/link";

import { getCredits } from "@/lib/data/tennis";

export const metadata: Metadata = { title: "Credits" };
export const revalidate = 3600;

export default async function CreditsPage() {
  const credits = await getCredits();

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Credits</h1>
        <p className="text-muted">
          Rankings and player data from{" "}
          <a href="https://www.balldontlie.io" className="underline underline-offset-2">
            BALLDONTLIE
          </a>
          . This site is not affiliated with or endorsed by the ATP or WTA.
        </p>
        <p className="text-muted">
          Country flags from{" "}
          <a href="https://github.com/lipis/flag-icons" className="underline underline-offset-2">
            flag-icons
          </a>{" "}
          (MIT License).
        </p>
      </header>

      <section aria-labelledby="results-heading" className="space-y-2">
        <h2 id="results-heading" className="text-lg font-semibold">
          Match results
        </h2>
        <p className="text-sm text-muted">
          Finished match results come from the singles draw pages of{" "}
          <a href="https://www.wikipedia.org/" className="underline underline-offset-2">
            Wikipedia
          </a>{" "}
          (mostly the English edition, a few from the Italian one), written by its volunteer editors and available under the{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline underline-offset-2">
            Creative Commons Attribution-ShareAlike 4.0
          </a>{" "}
          license. Every list of results links to the draw pages it was taken from. The results data shown on this site is
          shared under the same license. Results are read through the Wikipedia API and shown once a page has been
          unchanged for 10 minutes.
        </p>
      </section>

      <section aria-labelledby="recaps-heading" className="space-y-2">
        <h2 id="recaps-heading" className="text-lg font-semibold">
          Match recaps
        </h2>
        <p className="text-sm text-muted">
          When switched on, short recaps of finals and semifinals are written by Anthropic’s Claude from the match facts shown on
          the same page (players, score, round, our model’s pre-match chance, head-to-head). They are labelled as AI-written and
          can contain mistakes; no visitor data is sent.
        </p>
      </section>

      <section aria-labelledby="photos-heading" className="space-y-3">
        <h2 id="photos-heading" className="text-lg font-semibold">
          Player photos
        </h2>
        <p className="text-sm text-muted">
          Freely licensed photos from Wikimedia Commons, found through Wikidata. Thumbnails are shown unmodified apart
          from circular cropping. Players without a free photo get an initials avatar.
        </p>
        {credits.length === 0 ? (
          <p className="text-muted">No photos yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {credits.map((c) => (
              <li key={c.playerId} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <Link href={`/players/${c.playerId}`} className="font-medium hover:underline">
                  {c.playerName}
                </Link>
                <span className="text-muted sm:text-right">
                  <a href={c.sourceUrl} className="hover:underline">
                    {c.author}
                  </a>
                  {" · "}
                  {c.licenseUrl ? (
                    <a href={c.licenseUrl} className="hover:underline">
                      {c.license}
                    </a>
                  ) : (
                    c.license
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
