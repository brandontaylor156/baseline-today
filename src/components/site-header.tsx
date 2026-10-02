import Link from "next/link";

import { liveScoresEnabled } from "@/lib/features";

import { AuthButton } from "./auth-button";
import { SearchBox } from "./search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-3 rounded-full bg-accent" />
          Baseline Today
        </Link>
        <nav aria-label="Main" className="flex gap-0.5 text-sm sm:gap-1">
          {liveScoresEnabled() && (
            <Link href="/scores" className="rounded-md px-2 py-1.5 font-medium text-accent hover:bg-surface-muted sm:px-2.5">
              Live
            </Link>
          )}
          <Link href="/results" className="rounded-md px-2 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5">
            Results
          </Link>
          <Link href="/tournaments" className="rounded-md px-2 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5">
            Events
          </Link>
          <Link href="/odds" className="rounded-md px-2 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground sm:px-2.5">
            Odds
          </Link>
          <Link href="/rankings/atp" className="rounded-md px-2 py-1.5 sm:px-2.5 text-muted hover:bg-surface-muted hover:text-foreground">
            ATP
          </Link>
          <Link href="/rankings/wta" className="rounded-md px-2 py-1.5 sm:px-2.5 text-muted hover:bg-surface-muted hover:text-foreground">
            WTA
          </Link>
        </nav>
        {/* Phones: logo and links on the first row, search and sign-in share the second. */}
        <div className="order-9 min-w-0 flex-1 basis-48 sm:order-none sm:ml-auto sm:w-64 sm:flex-none sm:basis-auto">
          <SearchBox />
        </div>
        <div className="order-10 sm:order-last">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
