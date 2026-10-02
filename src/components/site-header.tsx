import Link from "next/link";

import { SearchBox } from "./search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-3 rounded-full bg-accent" />
          Baseline Today
        </Link>
        <nav aria-label="Rankings" className="flex gap-1 text-sm">
          <Link href="/rankings/atp" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground">
            ATP
          </Link>
          <Link href="/rankings/wta" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground">
            WTA
          </Link>
        </nav>
        <div className="order-last w-full sm:order-none sm:ml-auto sm:w-64">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
