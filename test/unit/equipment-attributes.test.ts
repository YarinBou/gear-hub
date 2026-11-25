import { describe, expect, it } from "vitest";
import { attributeTags, describeValue, parseAttributeDefs, parseAttributeValues } from "@/lib/equipment-attributes";

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
