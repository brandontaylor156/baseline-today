// Name normalization shared by Wikipedia parsing and player matching. Mirrors the database's
// search_normalize(): lower case, accents removed, Đ/đ → "dj".

const SPECIAL: Record<string, string> = { đ: "dj", ß: "ss", ø: "o", ł: "l", æ: "ae", œ: "oe", ı: "i", þ: "th" };

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[đßøłæœıþ]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lookup keys for a name: as written, and reversed for two-word East Asian names. */
export function nameKeys(name: string): string[] {
  const n = normalizeName(name);
  const words = n.split(" ");
  return words.length === 2 ? [n, `${words[1]} ${words[0]}`] : [n];
}
