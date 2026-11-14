import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { effectiveStatus, storageFlags } from "@/lib/storage-rules";

/**
 * One line per storage type: active types (with or without a row yet), plus deactivated
 * types that still hold stock. Status is derived at read time (see storage-rules.ts).
 */
export async function getStorageOverview() {
  await connection();
  const { db } = await companyContext();
  const now = new Date();
  const categories = await db.equipmentCategory.findMany({
    where: {
      domain: "STORAGE",
      OR: [{ isActive: true }, { storageItems: { some: { currentQuantity: { gt: 0 } } } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      requiresExpiry: true,
      storageItems: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          targetQuantity: true,
          currentQuantity: true,
          status: true,
          expiryDate: true,
          location: true,
          notes: true,
          updatedAt: true,
        },
      },
    },
  });

  return categories.map((c) => {
    const item = c.storageItems[0] ?? null;
    const values = item ?? {
      targetQuantity: 0,
      currentQuantity: 0,
      status: "OK" as const,
      expiryDate: null,
      location: null,
      notes: null,
      updatedAt: null,
    };
    const flags = storageFlags(values, now);
    return {
      categoryId: c.id,
      name: c.name,
      isActive: c.isActive,
      requiresExpiry: c.requiresExpiry,
      itemId: item?.id ?? null,
      ...values,
      flags,
      status: effectiveStatus(flags),
      damaged: values.status === "DAMAGED",
    };
  });
}

export type StorageLine = Awaited<ReturnType<typeof getStorageOverview>>[number];
