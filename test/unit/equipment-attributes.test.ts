import { describe, expect, it } from "vitest";
import { attributeTags, describeValue, isMissing, parseAttributeDefs, parseAttributeValues, validValue } from "@/lib/equipment-attributes";

const defs = parseAttributeDefs([
  { key: "case", label: "קייס", kind: "check" },
  { key: "ptt", label: "שלט PTT", kind: "check" },
  { key: "color", label: "צבע", kind: "choice", options: ["חום", "שחור", "חום"] },
  { key: "bad", label: "", kind: "check" },
  { key: "case", label: "כפול", kind: "check" },
  { key: "one", label: "בחירה אחת", kind: "choice", options: ["רק"] },
  "junk",
]);

describe("equipment properties (מאפיינים)", () => {
  it("keeps only valid, unique definitions; a choice needs at least two options", () => {
    expect(defs.map((d) => d.key)).toEqual(["case", "ptt", "color"]);
    expect(defs[2]).toMatchObject({ options: ["חום", "שחור"] });
  });
  it("keeps only values that match the type", () => {
    expect(parseAttributeValues({ case: true, ptt: "yes", color: "ירוק", other: 1 }, defs)).toEqual({ case: true });
    expect(parseAttributeValues({ color: "חום", ptt: false }, defs)).toEqual({ color: "חום", ptt: false });
  });
  it("describes and tags values; unrecorded ones are left out of the tags", () => {
    expect(describeValue(defs[0], true)).toBe("יש");
    expect(describeValue(defs[0], false)).toBe("אין");
    expect(describeValue(defs[0], undefined)).toBe("—");
    expect(attributeTags(defs, { case: true, ptt: false, color: "שחור" })).toEqual([
      { label: "קייס", missing: false },
      { label: "בלי שלט PTT", missing: true },
      { label: "שחור", missing: false },
    ]);
  });
});

describe("count properties (drones: batteries, propellers)", () => {
  const drone = parseAttributeDefs([
    { key: "bat", label: "סוללות", kind: "count" },
    { key: "sd", label: "כרטיס זיכרון", kind: "check" },
  ]);
  it("keeps whole numbers 0–999 only", () => {
    expect(parseAttributeValues({ bat: 4, sd: true }, drone)).toEqual({ bat: 4, sd: true });
    expect(parseAttributeValues({ bat: -1 }, drone)).toEqual({});
    expect(parseAttributeValues({ bat: 2.5 }, drone)).toEqual({});
    expect(parseAttributeValues({ bat: "4" }, drone)).toEqual({});
  });
  it("tags 'סוללות × 4'; 0 or unrecorded counts as missing", () => {
    expect(attributeTags(drone, { bat: 4 })).toEqual([{ label: "סוללות × 4", missing: false }]);
    expect(attributeTags(drone, { bat: 0 })).toEqual([{ label: "בלי סוללות", missing: true }]);
    expect(isMissing(drone[0], undefined)).toBe(true);
    expect(isMissing(drone[0], 0)).toBe(true);
    expect(isMissing(drone[0], 3)).toBe(false);
    expect(validValue(drone[0], 12)).toBe(true);
    expect(validValue(drone[0], 1000)).toBe(false);
  });
});
