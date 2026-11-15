import { describe, expect, it } from "vitest";
import { parseRosterText } from "@/lib/roster-import";
import { matchPlatoon } from "@/lib/platoons";

const defaults = [
  { id: "p1", name: "מחלקה 1" },
  { id: "p2", name: "מחלקה 2" },
  { id: "p3", name: "מחלקה 3" },
  { id: "hq", name: 'חפ"ק ומפל"ג' },
];
const teams = [
  { id: "t1", name: "צוות 1" },
  { id: "t2", name: "צוות 2" },
  { id: "mf", name: "מפלג" },
  { id: "hod", name: "חוד" },
];

describe("matchPlatoon", () => {
  it.each([
    ["1", "p1"],
    ["מחלקה 2", "p2"],
    ['חפ"ק', "hq"],
    ["מפלג", "hq"],
    ["", null],
    ["7", null],
  ])("default platoons: %s → %s", (raw, expected) => {
    expect(matchPlatoon(raw, defaults)?.id ?? null).toBe(expected);
  });

  it.each([
    ["2", "t2"],
    ["צוות 1", "t1"],
    ["מפלג", "mf"],
    ["מפל\"ג", "mf"],
    ["חוד", "hod"],
    ["3", null],
  ])("custom names: %s → %s", (raw, expected) => {
    expect(matchPlatoon(raw, teams)?.id ?? null).toBe(expected);
  });
});

describe("parseRosterText", () => {
  it("skips a header row and parses tab-separated lines", () => {
    const rows = parseRosterText("שם\tמספר אישי\nישראל ישראלי\t1234567\t\t\t2", null, defaults);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ok: true, data: { name: "ישראל ישראלי", platoon: "p2" } });
  });
  it("falls back to the default platoon", () => {
    const rows = parseRosterText("דני כהן", "hq", defaults);
    expect(rows[0]).toMatchObject({ ok: true, data: { platoon: "hq" } });
  });
  it("flags an unknown platoon and duplicate personal numbers", () => {
    const rows = parseRosterText("א ב,1111111,,,9\nג ד,2222222,,,1\nה ו,2222222,,,1", null, defaults);
    expect(rows[0]).toMatchObject({ ok: false });
    expect(rows[1]).toMatchObject({ ok: true });
    expect(rows[2]).toMatchObject({ ok: false, error: "מספר אישי כפול ברשימה" });
  });
});
