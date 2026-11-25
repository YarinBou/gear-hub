import { describe, expect, it } from "vitest";
import { attributeTags, describeSummary, describeValue, isMissing, parseAttributeDefs, parseAttributeValues, summarizeAttributes, validValue } from "@/lib/equipment-attributes";

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

describe("summarizeAttributes (report breakdown)", () => {
  const d = parseAttributeDefs([
    { key: "case", label: "קייס", kind: "check" },
    { key: "bat", label: "סוללות", kind: "count" },
    { key: "color", label: "צבע", kind: "choice", options: ["חום", "שחור"] },
  ]);
  const s = summarizeAttributes(d, [{ case: true, bat: 4, color: "חום" }, { case: false, bat: 2, color: "חום" }, { case: true }, {}]);
  it("counts יש / אין / not marked, sums counts and splits choices", () => {
    expect(s[0]).toMatchObject({ kind: "check", yes: 2, no: 1, unset: 1 });
    expect(s[1]).toMatchObject({ kind: "count", total: 6, recorded: 2, unset: 2 });
    expect(s[2]).toMatchObject({ kind: "choice", options: [{ option: "חום", n: 2 }, { option: "שחור", n: 0 }], unset: 2 });
  });
  it("describes each line for the export", () => {
    expect(describeSummary(s[0])).toBe("2 יש · 1 אין · 1 לא סומן");
    expect(describeSummary(s[1])).toBe('סה"כ 6 · 2 לא סומן');
    expect(describeSummary(s[2])).toBe("חום 2 · שחור 0 · 2 לא סומן");
  });
});
