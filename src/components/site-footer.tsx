import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <p>Rankings data from BALLDONTLIE, updated daily. Not affiliated with the ATP or WTA.</p>
        <Link href="/credits" className="underline-offset-2 hover:underline">
          Photo credits
        </Link>
      </div>
    </footer>
  );
}
