import { describe, expect, it } from "vitest";

import {
  birthDate,
  imageFileName,
  isFreeLicense,
  parseImageInfo,
  pickPlayerEntity,
  plainText,
  type WikidataEntity,
} from "./wikimedia-parse";

const item = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } });
const value = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });

const sinner: WikidataEntity = {
  id: "Q54812588",
  claims: {
    P106: [item("Q10833314")],
    P21: [item("Q6581097")],
    P18: [value("Jannik Sinner US Open 2025 (cropped).jpg")],
    P569: [value({ time: "+2001-08-16T00:00:00Z", precision: 11 })],
  },
};
const footballer: WikidataEntity = { id: "Q1", claims: { P106: [item("Q937857")], P21: [item("Q6581097")] } };

describe("Wikidata parsing", () => {
  it("picks the first tennis player of the tour's sex", () => {
    expect(pickPlayerEntity([footballer, sinner], "atp")?.id).toBe("Q54812588");
    expect(pickPlayerEntity([sinner], "wta")).toBeNull();
    expect(pickPlayerEntity([footballer], "atp")).toBeNull();
  });

  it("reads the image file and a day-precision birth date", () => {
    expect(imageFileName(sinner)).toBe("Jannik Sinner US Open 2025 (cropped).jpg");
    expect(birthDate(sinner)).toBe("2001-08-16");
    expect(birthDate({ id: "Q2", claims: { P569: [value({ time: "+1990-00-00T00:00:00Z", precision: 9 })] } })).toBeNull();
  });
});

describe("Commons parsing", () => {
  it("turns artist HTML into a plain credit", () => {
    expect(plainText('<p>The White House\n</p><ul><li>derivative work: <a href="//x">Kacir</a></li></ul>')).toBe(
      "The White House derivative work: Kacir",
    );
    expect(plainText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("accepts only licenses we can credit", () => {
    for (const ok of ["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain"]) expect(isFreeLicense(ok)).toBe(true);
    for (const bad of ["Fair use", "All rights reserved", ""]) expect(isFreeLicense(bad)).toBe(false);
  });

  it("builds a credited image and strips tracking parameters", () => {
    const parsed = parseImageInfo({
      thumburl: "https://upload.wikimedia.org/x/330px-a.jpg?utm_source=commons",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:A.jpg",
      extmetadata: {
        Artist: { value: "<a>Jane Doe</a>" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
      },
    });
    expect(parsed).toEqual({
      imageUrl: "https://upload.wikimedia.org/x/330px-a.jpg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg",
      author: "Jane Doe",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    });
  });

  it("rejects images without a usable license", () => {
    expect(parseImageInfo({ thumburl: "a", descriptionurl: "b", extmetadata: { LicenseShortName: { value: "Fair use" } } })).toBeNull();
    expect(parseImageInfo(undefined)).toBeNull();
  });
});
