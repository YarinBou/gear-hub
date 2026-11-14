import type { EquipmentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { VERIFICATION_STALE_DAYS } from "@/lib/constants";
import { daysAgo } from "@/lib/utils";

// Business rules for numbered equipment (צל"ם). Pure — safe for client and server.

/** "Not verified in 7 days" — missing items are excluded (they're already flagged). */
export function staleWhere(now = new Date()): Prisma.EquipmentAssignmentWhereInput {
  const before = new Date(now.getTime() - VERIFICATION_STALE_DAYS * 86_400_000);
  return {
    status: { not: "MISSING" },
    OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: before } }],
  };
}

export function isStale(item: { status: EquipmentStatus; lastVerifiedAt: Date | null }) {
  if (item.status === "MISSING") return false;
  return !item.lastVerifiedAt || item.lastVerifiedAt < daysAgo(VERIFICATION_STALE_DAYS);
}

/** Statuses that make sense for an item that is NOT held by a soldier. */
export const UNASSIGNED_STATUSES: EquipmentStatus[] = ["IN_ARMORY", "IN_REPAIR", "STORED", "MISSING"];

/**
 * Resolve the final status when (re)assigning:
 * - Handing an item to a soldier while it sits in the armory/storage → "אצל לוחם".
 * - Taking it away from a soldier while it says "אצל לוחם" → "בנשקייה".
 * An explicitly chosen status always wins unless it contradicts the holder.
 */
export function resolveStatus(opts: {
  current: EquipmentStatus;
  requested?: EquipmentStatus;
  hasSoldier: boolean;
}): { status: EquipmentStatus } | { error: string } {
  const { current, requested, hasSoldier } = opts;
  if (requested === "WITH_SOLDIER" && !hasSoldier) {
    return { error: 'הסטטוס "אצל לוחם" מחייב בחירת לוחם' };
  }
  if (requested) return { status: requested };
  if (hasSoldier && (current === "IN_ARMORY" || current === "STORED")) return { status: "WITH_SOLDIER" };
  if (!hasSoldier && current === "WITH_SOLDIER") return { status: "IN_ARMORY" };
  return { status: current };
}

/** Serial numbers: trimmed, inner whitespace removed, upper-cased Latin letters. */
export function normalizeSerial(raw: string) {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** Shown wherever an item has no serial number recorded yet. */
export const NO_SERIAL_LABEL = 'ללא צ';

/** Plain-text label for an item, e.g. "נגב 39510823" / "משקפת מפקד (ללא צ)". */
export function itemLabel(item: { serialNumber: string | null; category: { name: string } }) {
  return item.serialNumber ? `${item.category.name} ${item.serialNumber}` : `${item.category.name} (${NO_SERIAL_LABEL})`;
}
