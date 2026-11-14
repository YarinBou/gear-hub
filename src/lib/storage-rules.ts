import type { StorageStatus } from "@/generated/prisma/enums";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";

// Pure rules for company emergency storage (בימ"ח). Safe for client and server.

export type StorageFlags = {
  expired: boolean;
  expiringSoon: boolean;
  shortage: boolean;
  damaged: boolean;
};

export function storageFlags(
  item: { currentQuantity: number; targetQuantity: number; expiryDate: Date | null; status: StorageStatus },
  now = new Date(),
): StorageFlags {
  const warnBefore = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const hasStock = item.currentQuantity > 0;
  return {
    expired: hasStock && !!item.expiryDate && item.expiryDate < now,
    expiringSoon: hasStock && !!item.expiryDate && item.expiryDate >= now && item.expiryDate <= warnBefore,
    shortage: item.currentQuantity < item.targetQuantity,
    damaged: item.status === "DAMAGED",
  };
}

/**
 * The status shown everywhere is derived, so it can't go stale when time passes:
 * expired > shortage > damaged (the only manual flag) > ok.
 */
export function effectiveStatus(flags: StorageFlags): StorageStatus {
  if (flags.expired) return "EXPIRED";
  if (flags.shortage) return "SHORTAGE";
  if (flags.damaged) return "DAMAGED";
  return "OK";
}

export function fillPercent(current: number, target: number) {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / target) * 100));
}
