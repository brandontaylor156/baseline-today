import Link from "next/link";

import { liveScoresEnabled } from "@/lib/features";

import { AuthButton } from "./auth-button";
import { SearchBox } from "./search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-4 lg:gap-x-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-3 rounded-full bg-accent" />
          Baseline Today
        </Link>
        <nav aria-label="Main" className="-mx-4 flex basis-[calc(100%+2rem)] gap-0 overflow-x-auto whitespace-nowrap px-4 text-sm sm:mx-0 sm:basis-auto sm:gap-1 sm:px-0">
          {liveScoresEnabled() && (
            <Link href="/scores" className="rounded-md px-1.5 py-1.5 font-medium text-accent hover:bg-surface-muted sm:px-2.5 lg:px-2">
              Live
            </Link>
          )}
          <Link href="/results" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Results
          </Link>
          <Link href="/tournaments" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Events
          </Link>
          <Link href="/odds" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Odds
          </Link>
          <Link href="/stats" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Stats
          </Link>
          <Link href="/play" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Play
          </Link>
          <Link href="/rankings/atp" className="rounded-md px-1.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5 lg:px-2">
            Rankings
          </Link>
        </nav>
        {/* Below lg: logo and links on the first row, search and sign-in share the second. */}
        <div className="flex basis-full items-center gap-3 lg:ml-auto lg:basis-auto lg:gap-3">
          <div className="min-w-0 flex-1 lg:w-36 lg:flex-none">
            <SearchBox />
          </div>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
