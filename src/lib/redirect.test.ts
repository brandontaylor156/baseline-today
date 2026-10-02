import { describe, expect, it } from "vitest";

import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/my-players")).toBe("/my-players");
    expect(safeNext("/players/12?x=1")).toBe("/players/12?x=1");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
