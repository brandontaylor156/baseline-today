import { describe, expect, it } from "vitest";

import { clip300, facets } from "./bluesky-text";

describe("facets", () => {
  it("finds hashtags and links by UTF-8 byte offset", () => {
    const text = "Đoković wins 🎾 #tennis https://example.com/x";
    const f = facets(text);
    expect(f).toHaveLength(2);
    const enc = new TextEncoder().encode(text);
    const slice = (x: (typeof f)[number]) => new TextDecoder().decode(enc.slice(x.index.byteStart, x.index.byteEnd));
    expect(slice(f[0])).toBe("#tennis");
    expect(f[0].features[0]).toEqual({ $type: "app.bsky.richtext.facet#tag", tag: "tennis" });
    expect(slice(f[1])).toBe("https://example.com/x");
  });

  it("ignores # inside words", () => {
    expect(facets("score#1 is fine")).toHaveLength(0);
  });
});

describe("clip300", () => {
  it("keeps short text and cuts long text by graphemes", () => {
    expect(clip300("short")).toBe("short");
    const long = "🎾".repeat(400);
    const out = clip300(long);
    expect([...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(out)]).toHaveLength(300);
    expect(out.endsWith("…")).toBe(true);
  });
});
