// Readable URL slugs (pure, unit tested). Ids stay in the URL, so names never need to be unique.

/** "Novak Đoković" → "novak-djokovic". */
export function slugify(name: string): string {
  return name
    .replace(/[Đđ]/g, "dj")
    .replace(/[Øø]/g, "o")
    .replace(/[Łł]/g, "l")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical head-to-head path: /h2h/jannik-sinner-vs-carlos-alcaraz-123-456 (lower id first). */
export function h2hPath(a: { id: number; name: string }, b: { id: number; name: string }): string {
  const [x, y] = a.id <= b.id ? [a, b] : [b, a];
  return `/h2h/${slugify(x.name)}-vs-${slugify(y.name)}-${x.id}-${y.id}`;
}

/** The two player ids at the end of a head-to-head slug, or null. */
export function parseH2H(pair: string): { a: number; b: number } | null {
  const m = /-(\d{1,9})-(\d{1,9})$/.exec(pair);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === b ? null : { a, b };
}
