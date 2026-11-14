import { describe, expect, it } from "vitest";
import { parsePlatoon, parseRosterText } from "@/lib/roster-import";

describe("parsePlatoon", () => {
  it.each([
    ["1", "PLATOON_1"],
    ["מחלקה 2", "PLATOON_2"],
    ['חפ"ק', "HQ"],
    ["מפלג", "HQ"],
    ["", null],
    ["7", null],
  ])("%s → %s", (raw, expected) => {
    expect(parsePlatoon(raw)).toBe(expected);
  });
});

describe("parseRosterText", () => {
  it("skips a header row and parses tab-separated lines", () => {
    const rows = parseRosterText("שם\tמספר אישי\nישראל ישראלי\t1234567\t\t\t2", null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ok: true, data: { name: "ישראל ישראלי", platoon: "PLATOON_2" } });
  });
  it("falls back to the default platoon", () => {
    const rows = parseRosterText("דני כהן", "HQ");
    expect(rows[0]).toMatchObject({ ok: true, data: { platoon: "HQ" } });
  });
  it("flags an unknown platoon and duplicate personal numbers", () => {
    const rows = parseRosterText("א ב,1111111,,,9\nג ד,2222222,,,1\nה ו,2222222,,,1", null);
    expect(rows[0]).toMatchObject({ ok: false });
    expect(rows[1]).toMatchObject({ ok: true });
    expect(rows[2]).toMatchObject({ ok: false, error: "מספר אישי כפול ברשימה" });
  });
});
