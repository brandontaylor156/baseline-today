import Link from "next/link";

export default function NotFound() {
  return (
    <section className="py-16 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Out of bounds</h1>
      <p className="mt-2 text-muted">That page doesn’t exist.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background">
        Back to rankings
      </Link>
    </section>
  );
}
