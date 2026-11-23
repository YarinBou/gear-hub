import { describe, expect, it } from "vitest";
import { applyMovement, ammoLevel, isLowStock } from "@/lib/ammo-rules";
import { isStale, itemLabel, normalizeSerial, resolveStatus } from "@/lib/equipment-rules";
import {
  checklistLines,
  defaultStatus,
  groupLines,
  kitReadiness,
  expectedOf,
  lineComplete,
  missingDescriptions,
  summarizeKits,
  type ChecklistLine,
} from "@/lib/kit";
import { effectiveStatus, fillPercent, storageFlags } from "@/lib/storage-rules";

describe("equipment: resolveStatus", () => {
  it("handing an armory item to a soldier makes it 'with soldier'", () => {
    expect(resolveStatus({ current: "IN_ARMORY", hasSoldier: true })).toEqual({ status: "WITH_SOLDIER" });
    expect(resolveStatus({ current: "STORED", hasSoldier: true })).toEqual({ status: "WITH_SOLDIER" });
  });
  it("taking it back from a soldier makes it stored", () => {
    expect(resolveStatus({ current: "WITH_SOLDIER", hasSoldier: false })).toEqual({ status: "STORED" });
    // An item already in the armory stays there.
    expect(resolveStatus({ current: "IN_ARMORY", hasSoldier: false })).toEqual({ status: "IN_ARMORY" });
  });
  it("keeps repair / missing when the holder changes", () => {
    expect(resolveStatus({ current: "IN_REPAIR", hasSoldier: true })).toEqual({ status: "IN_REPAIR" });
    expect(resolveStatus({ current: "MISSING", hasSoldier: false })).toEqual({ status: "MISSING" });
  });
  it("an explicit status wins, but 'with soldier' needs a soldier", () => {
    expect(resolveStatus({ current: "IN_ARMORY", requested: "IN_REPAIR", hasSoldier: true })).toEqual({ status: "IN_REPAIR" });
    expect(resolveStatus({ current: "IN_ARMORY", requested: "WITH_SOLDIER", hasSoldier: false })).toHaveProperty("error");
  });
});

describe("equipment: helpers", () => {
  it("normalizes serials", () => {
    expect(normalizeSerial("  ab 12 3c ")).toBe("AB123C");
  });
  it("labels items with and without a serial", () => {
    expect(itemLabel({ serialNumber: "123", category: { name: "נגב" } })).toBe("נגב 123");
    expect(itemLabel({ serialNumber: null, category: { name: "משקפת" } })).toBe("משקפת (ללא צ)");
  });
  it("missing items are never 'stale'; unverified items are", () => {
    expect(isStale({ status: "MISSING", lastVerifiedAt: null })).toBe(false);
    expect(isStale({ status: "IN_ARMORY", lastVerifiedAt: null })).toBe(true);
    expect(isStale({ status: "IN_ARMORY", lastVerifiedAt: new Date() })).toBe(false);
  });
});

describe("ammo rules", () => {
  it("count sets, receive adds, issue subtracts", () => {
    expect(applyMovement(100, "COUNT", 40)).toEqual({ quantity: 40 });
    expect(applyMovement(100, "RECEIVE", 40)).toEqual({ quantity: 140 });
    expect(applyMovement(100, "ISSUE", 40)).toEqual({ quantity: 60 });
  });
  it("an issue can never take stock below zero", () => {
    expect(applyMovement(10, "ISSUE", 11)).toHaveProperty("error");
    expect(applyMovement(10, "ISSUE", 10)).toEqual({ quantity: 0 });
  });
  it("levels and low-stock", () => {
    expect(ammoLevel(0, null)).toBe("EMPTY");
    expect(ammoLevel(5, null)).toBe("NO_THRESHOLD");
    expect(ammoLevel(5, 10)).toBe("LOW");
    expect(ammoLevel(10, 10)).toBe("OK");
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(5, null)).toBe(false);
  });
});

describe("storage rules", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const day = 86_400_000;
  it("expired beats shortage beats damaged", () => {
    const base = { currentQuantity: 5, targetQuantity: 10, status: "DAMAGED" as const };
    expect(effectiveStatus(storageFlags({ ...base, expiryDate: new Date(now.getTime() - day) }, now))).toBe("EXPIRED");
    expect(effectiveStatus(storageFlags({ ...base, expiryDate: null }, now))).toBe("SHORTAGE");
    expect(effectiveStatus(storageFlags({ ...base, currentQuantity: 10, expiryDate: null }, now))).toBe("DAMAGED");
  });
  it("an empty batch can't expire", () => {
    const f = storageFlags({ currentQuantity: 0, targetQuantity: 0, status: "OK", expiryDate: new Date(now.getTime() - day) }, now);
    expect(f.expired).toBe(false);
  });
  it("fill percent caps at 100", () => {
    expect(fillPercent(15, 10)).toBe(100);
    expect(fillPercent(5, 10)).toBe(50);
    expect(fillPercent(0, 0)).toBe(0);
  });
});

describe("kit checklist", () => {
  const line = (over: Partial<ChecklistLine> = {}): ChecklistLine => ({
    itemId: "i",
    label: "קסדה",
    groupName: "ציוד אישי",
    sortOrder: 10,
    targetQuantity: null,
    systemKey: null,
    present: false,
    quantity: null,
    baseline: null,
    ...over,
  });

  it("a plain item is complete when present; a counted one when it reaches its target", () => {
    expect(lineComplete(line({ present: true }))).toBe(true);
    expect(lineComplete(line({ targetQuantity: 7, quantity: 6 }))).toBe(false);
    expect(lineComplete(line({ targetQuantity: 7, quantity: 7 }))).toBe(true);
    expect(lineComplete(line({ targetQuantity: 7, quantity: null }))).toBe(false);
  });

  it("readiness counts complete lines; an empty checklist has nothing missing", () => {
    expect(kitReadiness([line({ present: true }), line(), line({ targetQuantity: 2, quantity: 2 }), line()])).toBe(50);
    expect(kitReadiness([])).toBe(100);
  });

  it("missing lines are described for the inspection record", () => {
    const lines = [line({ label: "קסדה" }), line({ label: "מחסניות", targetQuantity: 7, quantity: 5 }), line({ label: "שק שינה", present: true })];
    expect(missingDescriptions(lines)).toEqual(["קסדה", "מחסניות (5/7)"]);
  });

  it("what the soldier signed for decides what's missing", () => {
    // Not signed for (baseline 0): never missing, and left out of readiness.
    const notMine = line({ label: "ווסט מטול", baseline: 0 });
    expect(lineComplete(notMine)).toBe(true);
    expect(kitReadiness([notMine, line({ present: true, baseline: 1 })])).toBe(100);
    expect(missingDescriptions([notMine])).toEqual([]);
    // Signed for 1 shirt (list default 2): has 1 → complete; has 0 → "(0/1)".
    expect(lineComplete(line({ targetQuantity: 2, baseline: 1, quantity: 1 }))).toBe(true);
    expect(missingDescriptions([line({ label: "חולצת ב'", targetQuantity: 2, baseline: 1, quantity: 0 })])).toEqual(["חולצת ב' (0/1)"]);
    // Signed for a plain item, now gone → missing.
    expect(lineComplete(line({ baseline: 1, present: false }))).toBe(false);
  });

  it("the summary sums what was signed for, what's there, and what's missing kit by kit", () => {
    const plates = (over: Partial<ChecklistLine>) => line({ itemId: "p", label: "פלטות", targetQuantity: 2, ...over });
    const vest = (over: Partial<ChecklistLine>) => line({ itemId: "v", label: "ווסט מטול", sortOrder: 20, ...over });
    const summary = summarizeKits([
      // Signed for 2 plates, has 1; not signed for the vest but has one anyway.
      { signed: true, lines: [plates({ baseline: 2, quantity: 1 }), vest({ baseline: 0, present: true })] },
      // Signed for 1 plate, has 2 — the extra doesn't cover the first kit's shortage.
      { signed: true, lines: [plates({ baseline: 1, quantity: 2 }), vest({ baseline: 1, present: true })] },
      // Not signed yet: counts as there / missing per the list, not as signed for.
      { signed: false, lines: [plates({ quantity: 0 }), vest({ present: false })] },
    ]);
    expect(summary).toMatchObject([
      { itemId: "p", signed: 3, have: 3, missing: 1 + 2 },
      { itemId: "v", signed: 1, have: 2, missing: 1 },
    ]);
  });

  it("groups keep checklist order, each group where its first item is", () => {
    const groups = groupLines([
      line({ itemId: "c", groupName: "ב", sortOrder: 30 }),
      line({ itemId: "a", groupName: "א", sortOrder: 10 }),
      line({ itemId: "b", groupName: "ב", sortOrder: 20 }),
      line({ itemId: "d", groupName: "א", sortOrder: 40 }),
    ]);
    expect(groups.map((g) => [g.groupName, g.lines.map((l) => l.itemId)])).toEqual([
      ["א", ["a", "d"]],
      ["ב", ["b", "c"]],
    ]);
  });

  it("new lines start per the company setting", () => {
    expect(defaultStatus({ targetQuantity: null, startPresent: false })).toEqual({ present: false, quantity: null });
    expect(defaultStatus({ targetQuantity: null, startPresent: true })).toEqual({ present: true, quantity: null });
    expect(defaultStatus({ targetQuantity: 7, startPresent: true })).toEqual({ present: false, quantity: 7 });
    expect(defaultStatus({ targetQuantity: 7, startPresent: false })).toEqual({ present: false, quantity: 0 });
  });

  it("a live kit shows the active list; a closed deployment shows what was recorded", () => {
    const def = (id: string, isActive = true) => ({ id, label: id, groupName: "g", sortOrder: 0, targetQuantity: null, systemKey: null, isActive });
    const rows = [
      { present: true, quantity: null, baseline: null, item: def("old", false) },
      { present: true, quantity: null, baseline: null, item: def("kept") },
    ];
    const activeDefs = [def("kept"), def("added")];
    expect(checklistLines(rows, { history: false, activeDefs }).map((l) => [l.itemId, l.present])).toEqual([
      ["kept", true],
      ["added", false],
    ]);
    expect(checklistLines(rows, { history: true }).map((l) => l.itemId).sort()).toEqual(["kept", "old"]);
  });
});

describe("kit: optional items and פק\"ל requirements", () => {
  const counted = { targetQuantity: 4, present: false, quantity: 0 };
  it("an optional item is part of the kit only when signed for", () => {
    expect(expectedOf({ ...counted, baseline: null, optional: true })).toBeNull();
    expect(expectedOf({ ...counted, baseline: 2, optional: true })).toBe(2);
    expect(expectedOf({ ...counted, baseline: 0, optional: true })).toBeNull();
    expect(lineComplete({ ...counted, baseline: null, optional: true })).toBe(true);
  });
  it("a פק\"ל requirement makes it part of the kit, at least its quantity", () => {
    expect(expectedOf({ ...counted, baseline: null, optional: true, pakalQuantity: 4 })).toBe(4);
    // Signed for less (or not at all) — the פק"ל still requires it.
    expect(expectedOf({ ...counted, baseline: 0, optional: true, pakalQuantity: 4 })).toBe(4);
    // Signed for more — what was signed counts.
    expect(expectedOf({ ...counted, baseline: 6, pakalQuantity: 4 })).toBe(6);
    expect(expectedOf({ targetQuantity: null, baseline: 0, optional: true, pakalQuantity: 1 })).toBe(1);
  });
  it("regular items are unchanged", () => {
    expect(expectedOf({ targetQuantity: 7, baseline: null })).toBe(7);
    expect(expectedOf({ targetQuantity: 7, baseline: 5 })).toBe(5);
    expect(expectedOf({ targetQuantity: null, baseline: null })).toBe(1);
  });
});
