// Bluesky post text (pure, unit tested): rich-text facets for hashtags and links, which Bluesky
// addresses by UTF-8 byte offsets, and the 300-grapheme limit.

export type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: ({ $type: "app.bsky.richtext.facet#tag"; tag: string } | { $type: "app.bsky.richtext.facet#link"; uri: string })[];
};

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Facets for every #hashtag and https:// link in the text. */
export function facets(text: string): Facet[] {
  const out: Facet[] = [];
  for (const m of text.matchAll(/(^|\s)(#[\p{L}\p{N}_]+)|(https:\/\/[^\s]+)/gu)) {
    const token = m[2] ?? m[3];
    const start = m.index! + (m[2] ? m[1].length : 0);
    const index = { byteStart: bytes(text.slice(0, start)), byteEnd: bytes(text.slice(0, start)) + bytes(token) };
    out.push({
      index,
      features: [m[2] ? { $type: "app.bsky.richtext.facet#tag", tag: token.slice(1) } : { $type: "app.bsky.richtext.facet#link", uri: token }],
    });
  }
  return out;
}

/** Trims to Bluesky's 300-grapheme limit, ending with an ellipsis when cut. */
export function clip300(text: string): string {
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return graphemes.length <= 300 ? text : `${graphemes.slice(0, 299).join("").trimEnd()}…`;
}
