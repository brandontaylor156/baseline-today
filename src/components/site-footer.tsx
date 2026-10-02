import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <p>Rankings data from BALLDONTLIE, updated daily. Not affiliated with the ATP or WTA.</p>
        <nav aria-label="Footer" className="flex gap-4">
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
