import type { AmmoLogType } from "@/generated/prisma/enums";

// Pure ammunition rules — safe for client and server, shared by the ammo page and the dashboard.

export type AmmoLevel = "OK" | "LOW" | "EMPTY" | "NO_THRESHOLD";

/** Company-wide stock level of one ammo type against its catalog threshold. */
export function ammoLevel(total: number, threshold: number | null): AmmoLevel {
  if (threshold == null || threshold === 0) return total === 0 ? "EMPTY" : "NO_THRESHOLD";
  if (total === 0) return "EMPTY";
  if (total < threshold) return "LOW";
  return "OK";
}

/** Below threshold (or empty while a threshold exists) — what triggers a low-stock alert. */
export function isLowStock(total: number, threshold: number | null) {
  return threshold != null && threshold > 0 && total < threshold;
}

export const AMMO_LEVEL_LABELS: Record<AmmoLevel, string> = {
  OK: "תקין",
  LOW: "מתחת לסף",
  EMPTY: "אזל",
  NO_THRESHOLD: "ללא סף",
};

/** Note on a count that only confirmed the quantity (אימות), without typing it again. */
export const VERIFY_NOTE = "אימות — ללא שינוי";

export const AMMO_LOG_LABELS: Record<AmmoLogType, string> = {
  COUNT: "ספירה",
  RECEIVE: "קליטה",
  ISSUE: "ניפוק",
};

/** New quantity after a movement, or an error (Hebrew) if it would go negative. */
export function applyMovement(
  current: number,
  type: AmmoLogType,
  amount: number,
): { quantity: number } | { error: string } {
  if (type === "COUNT") return { quantity: amount };
  if (type === "RECEIVE") return { quantity: current + amount };
  if (amount > current) return { error: `לא ניתן לנפק ${amount} — במלאי ${current} בלבד` };
  return { quantity: current - amount };
}
