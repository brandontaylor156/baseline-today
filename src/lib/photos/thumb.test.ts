import { describe, expect, it } from "vitest";

import { thumbUrl } from "./thumb";

describe("thumbUrl", () => {
  const url = "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Carlos_%28c%29.jpg/330px-Carlos_%28c%29.jpg";

  it("swaps the width in the last path segment only", () => {
    expect(thumbUrl(url, 120)).toBe("https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Carlos_%28c%29.jpg/120px-Carlos_%28c%29.jpg");
  });

  it("leaves non-thumbnail URLs alone", () => {
    const original = "https://upload.wikimedia.org/wikipedia/commons/f/fa/Carlos.jpg";
    expect(thumbUrl(original, 120)).toBe(original);
  });
});
