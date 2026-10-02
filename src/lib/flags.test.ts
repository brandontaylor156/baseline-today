import { describe, expect, it } from "vitest";

import { flagCode } from "./flags";

describe("flagCode", () => {
  it("maps IOC codes whose ISO code differs", () => {
    expect(flagCode("GER")).toBe("de");
    expect(flagCode("SUI")).toBe("ch");
    expect(flagCode("NED")).toBe("nl");
    expect(flagCode("CRO")).toBe("hr");
    expect(flagCode("CHI")).toBe("cl");
    expect(flagCode("gbr")).toBe("gb");
  });

  it("shows no flag for neutral athletes, unknown or missing codes", () => {
    expect(flagCode("RUS")).toBeNull();
    expect(flagCode("BLR")).toBeNull();
    expect(flagCode("XXX")).toBeNull();
    expect(flagCode(null)).toBeNull();
  });
});
