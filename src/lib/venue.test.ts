import { describe, expect, it } from "vitest";

import { hostCountry } from "./venue";

describe("hostCountry", () => {
  it("reads IOC codes, country names and bare cities", () => {
    expect(hostCountry("ROME, ITA")).toBe("ITA");
    expect(hostCountry("CHICAGO, IL, UNITED STATES")).toBe("USA");
    expect(hostCountry("SAN JOSE, UNITED STATES, CA")).toBe("USA");
    expect(hostCountry("CARLSBAD, USA, CA")).toBe("USA");
    expect(hostCountry("KAOHSIUNG, CHINESE TAIPEI")).toBe("TPE");
    expect(hostCountry("Monte-Carlo")).toBe("MON");
    expect(hostCountry("'s-Hertogenbosch")).toBe("NED");
    expect(hostCountry("AUSTRIA")).toBe("AUT");
  });
  it("gives up on unknown and multi-venue events", () => {
    expect(hostCountry("Multiple Locations")).toBeNull();
    expect(hostCountry("Perth-Sydney")).toBeNull();
    expect(hostCountry(null)).toBeNull();
  });
});
