import { describe, expect, it } from "vitest";
import { applyMovement, ammoLevel, isLowStock } from "@/lib/ammo-rules";
import { isStale, itemLabel, normalizeSerial, resolveStatus } from "@/lib/equipment-rules";
import { KIT_ITEM_KEYS, kitReadiness } from "@/lib/kit";
import { effectiveStatus, fillPercent, storageFlags } from "@/lib/storage-rules";

describe("equipment: resolveStatus", () => {
  it("handing an armory item to a soldier makes it 'with soldier'", () => {
    expect(resolveStatus({ current: "IN_ARMORY", hasSoldier: true })).toEqual({ status: "WITH_SOLDIER" });
    expect(resolveStatus({ current: "STORED", hasSoldier: true })).toEqual({ status: "WITH_SOLDIER" });
  });
  it("taking it back returns it to the armory", () => {
    expect(resolveStatus({ current: "WITH_SOLDIER", hasSoldier: false })).toEqual({ status: "IN_ARMORY" });
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

describe("kit readiness", () => {
  const all = (v: boolean) => Object.fromEntries(KIT_ITEM_KEYS.map((k) => [k, v])) as Parameters<typeof kitReadiness>[0];
  it("0 when empty, 100 when full", () => {
    expect(kitReadiness(all(false))).toBe(0);
    expect(kitReadiness(all(true))).toBe(100);
  });
});
