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
