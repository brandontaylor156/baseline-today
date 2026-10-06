import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <p>
          Rankings from BALLDONTLIE, results from Wikipedia (CC BY-SA 4.0). Not affiliated with the ATP or WTA.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/week" className="underline-offset-2 hover:underline">
            Weekly
          </Link>
          <Link href="/countries" className="underline-offset-2 hover:underline">
            Countries
          </Link>
          <Link href="/data" className="underline-offset-2 hover:underline">
            Open data
          </Link>
          <Link href="/about" className="underline-offset-2 hover:underline">
            About
          </Link>
          <Link href="/widgets" className="underline-offset-2 hover:underline">
            Widgets
          </Link>
          <Link href="/status" className="underline-offset-2 hover:underline">
            Status
          </Link>
          <Link href="/credits" className="underline-offset-2 hover:underline">
            Credits
          </Link>
          <Link href="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
