import { describe, expect, it } from "vitest";
import { missingSummary, SetSchema, setStatus } from "@/lib/equipment-sets";

const slot = (categoryId: string, name: string, quantity = 1, required = true) => ({ categoryId, category: { name }, quantity, required });

describe("equipment sets: setStatus", () => {
  const negev = [slot("kansap", 'קנס"פ'), slot("shaa", 'שח"ע'), slot("laser", "ציין", 2), slot("adapter", "מתאם", 1, false)];

  it("is complete when every required line is filled", () => {
    const s = setStatus(negev, [{ categoryId: "kansap" }, { categoryId: "shaa" }, { categoryId: "laser" }, { categoryId: "laser" }]);
    expect(s).toMatchObject({ complete: true, missing: 0, extras: 0 });
  });

  it("counts missing pieces per required line; optional add-ons never count as missing", () => {
    const s = setStatus(negev, [{ categoryId: "kansap" }, { categoryId: "laser" }]);
    expect(s.complete).toBe(false);
    expect(s.missing).toBe(2);
    expect(missingSummary(s)).toBe('שח"ע, ציין');
    expect(s.lines.find((l) => l.categoryId === "adapter")).toMatchObject({ have: 0, missing: 0 });
  });

  it("shows quantities above one and counts components outside the set as extras", () => {
    const s = setStatus(negev, [{ categoryId: "kansap" }, { categoryId: "shaa" }, { categoryId: "binoculars" }]);
    expect(missingSummary(s)).toBe("ציין ×2");
    expect(s.extras).toBe(1);
  });
});

describe("equipment sets: SetSchema", () => {
  const base = { name: "ערכת מפקד", mainCategoryId: "m4", notes: "" };

  it("accepts a set with lines", () => {
    expect(SetSchema.safeParse({ ...base, slots: [{ categoryId: "bino", quantity: "1", required: true }] }).success).toBe(true);
  });

  it("needs at least one line and refuses the same type twice", () => {
    expect(SetSchema.safeParse({ ...base, slots: [] }).success).toBe(false);
    const dup = SetSchema.safeParse({
      ...base,
      slots: [
        { categoryId: "bino", quantity: 1, required: true },
        { categoryId: "bino", quantity: 1, required: false },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it("refuses a zero quantity", () => {
    expect(SetSchema.safeParse({ ...base, slots: [{ categoryId: "bino", quantity: 0, required: true }] }).success).toBe(false);
  });
});
