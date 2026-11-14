import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import { resolveStatus } from "@/lib/equipment-rules";

// Single place that changes who holds an item / its status / platoon, and writes the history log.
// Every module that moves equipment (צל"ם page, bulk actions, kit sign-out) must go through here.

type Tx = Prisma.TransactionClient;

export type AssignmentInput = {
  /** undefined = keep current holder; null = return to company (no soldier) */
  soldierId?: string | null;
  status?: EquipmentStatus;
  /** Only used when the item has no soldier. undefined = keep; null = no platoon. */
  platoon?: Platoon | null;
  note?: string;
  verify?: boolean;
};

export class AssignmentError extends Error {}

export async function applyAssignment(tx: Tx, itemId: string, input: AssignmentInput, userId: string) {
  const item = await tx.equipmentItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, status: true, platoon: true, assignedSoldierId: true },
  });

  const soldierId = input.soldierId === undefined ? item.assignedSoldierId : input.soldierId;
  let platoon: Platoon | null;

  if (soldierId) {
    const soldier = await tx.soldier.findUnique({ where: { id: soldierId }, select: { platoon: true, isActive: true } });
    if (!soldier) throw new AssignmentError("הלוחם לא נמצא");
    if (!soldier.isActive && soldierId !== item.assignedSoldierId) {
      throw new AssignmentError('לא ניתן לשייך ללוחם שהוצא מהסד"כ');
    }
    platoon = soldier.platoon; // auto-filled from the holder
  } else {
    platoon = input.platoon === undefined ? item.platoon : input.platoon;
  }

  const resolved = resolveStatus({ current: item.status, requested: input.status, hasSoldier: !!soldierId });
  if ("error" in resolved) throw new AssignmentError(resolved.error);
  const status = resolved.status;

  const changed =
    soldierId !== item.assignedSoldierId || status !== item.status || platoon !== item.platoon;

  await tx.equipmentItem.update({
    where: { id: itemId },
    data: {
      assignedSoldierId: soldierId,
      status,
      platoon,
      ...(input.verify ? { lastVerifiedAt: new Date() } : {}),
    },
  });

  if (changed || input.note) {
    await tx.equipmentLog.create({
      data: {
        itemId,
        fromSoldierId: item.assignedSoldierId,
        toSoldierId: soldierId,
        fromStatus: item.status,
        toStatus: status,
        platoon,
        note: input.note,
        performedById: userId,
      },
    });
  }
  return { changed };
}
