import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import { itemLabel, resolveStatus } from "@/lib/equipment-rules";

// Single place that changes who holds an item / its status / platoon, and writes the history log.
// Every module that moves equipment (צל"ם page, bulk actions, kit sign-out) must go through here.
//
// Linked sets: an item may have components (e.g. a נגב with its ציין and קנס"פ). Components always
// mirror their parent's holder / status / platoon, so moving the parent moves the whole set, and a
// component can't be moved on its own while attached.

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

type State = { assignedSoldierId: string | null; status: EquipmentStatus; platoon: Platoon | null };
type ItemRef = State & { id: string; companyId: string };

/** Set one item's holder/status/platoon and log the change. No rules — callers decide the target state. */
async function writeState(
  tx: Tx,
  item: ItemRef,
  next: State,
  opts: { note?: string; verify?: boolean; userId: string },
) {
  const changed =
    next.assignedSoldierId !== item.assignedSoldierId || next.status !== item.status || next.platoon !== item.platoon;
  await tx.equipmentItem.update({
    where: { id: item.id },
    // Pick the three fields explicitly — callers may pass a whole item record as `next`.
    data: {
      assignedSoldierId: next.assignedSoldierId,
      status: next.status,
      platoon: next.platoon,
      ...(opts.verify ? { lastVerifiedAt: new Date() } : {}),
    },
  });
  if (changed || opts.note) {
    await tx.equipmentLog.create({
      data: {
        companyId: item.companyId,
        itemId: item.id,
        fromSoldierId: item.assignedSoldierId,
        toSoldierId: next.assignedSoldierId,
        fromStatus: item.status,
        toStatus: next.status,
        platoon: next.platoon,
        note: opts.note,
        performedById: opts.userId,
      },
    });
  }
  return changed;
}

/** Copy a parent's state onto all its components (with a history entry on each that changed). */
async function syncComponents(
  tx: Tx,
  parent: { id: string; serialNumber: string | null; category: { name: string } },
  next: State,
  opts: { verify?: boolean; userId: string },
) {
  const components = await tx.equipmentItem.findMany({
    where: { parentId: parent.id },
    select: { id: true, companyId: true, assignedSoldierId: true, status: true, platoon: true },
  });
  const note = `עבר יחד עם ${itemLabel(parent)}`;
  for (const c of components) {
    const moves = c.assignedSoldierId !== next.assignedSoldierId || c.status !== next.status || c.platoon !== next.platoon;
    // Only components that actually move get a history entry (explaining why).
    await writeState(tx, c, next, { ...opts, note: moves ? note : undefined });
  }
}

export async function applyAssignment(tx: Tx, itemId: string, input: AssignmentInput, userId: string) {
  // With a company-scoped client, another company's item reads as "not found".
  const item = await tx.equipmentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      companyId: true,
      serialNumber: true,
      status: true,
      platoon: true,
      assignedSoldierId: true,
      category: { select: { name: true } },
      parent: { select: { serialNumber: true, category: { select: { name: true } } } },
    },
  });
  if (!item) throw new AssignmentError("הפריט לא נמצא");
  if (item.parent) {
    throw new AssignmentError(
      `הפריט הוא רכיב של ${itemLabel(item.parent)}. יש לעדכן את השיוך בפריט הראשי, או לנתק את הרכיב תחילה.`,
    );
  }

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

  const next: State = { assignedSoldierId: soldierId, status: resolved.status, platoon };
  const changed = await writeState(tx, item, next, { note: input.note, verify: input.verify, userId });
  await syncComponents(tx, item, next, { verify: input.verify, userId });
  return { changed };
}

/**
 * Attach `childId` as a component of `parentId`. The child takes the parent's holder/status/platoon.
 * Rules: one level only; the child may not be held by a different soldier than the parent.
 */
export async function attachComponent(tx: Tx, parentId: string, childId: string, userId: string) {
  if (parentId === childId) throw new AssignmentError("לא ניתן לצרף פריט לעצמו");
  const [parent, child] = await Promise.all([
    tx.equipmentItem.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        serialNumber: true,
        parentId: true,
        assignedSoldierId: true,
        status: true,
        platoon: true,
        category: { select: { name: true } },
      },
    }),
    tx.equipmentItem.findUnique({
      where: { id: childId },
      select: {
        id: true,
        companyId: true,
        serialNumber: true,
        parentId: true,
        assignedSoldierId: true,
        status: true,
        platoon: true,
        category: { select: { name: true } },
        assignedSoldier: { select: { name: true } },
        _count: { select: { components: true } },
      },
    }),
  ]);
  if (!parent || !child) throw new AssignmentError("הפריט לא נמצא");
  if (parent.parentId) throw new AssignmentError("פריט שהוא רכיב לא יכול לשמש כפריט ראשי");
  if (child.parentId) throw new AssignmentError(`${itemLabel(child)} כבר משויך כרכיב של פריט אחר`);
  if (child._count.components) throw new AssignmentError(`ל${itemLabel(child)} יש רכיבים משלו`);
  if (child.assignedSoldierId && child.assignedSoldierId !== parent.assignedSoldierId) {
    throw new AssignmentError(`${itemLabel(child)} מוחזק ע"י ${child.assignedSoldier?.name ?? "לוחם אחר"}`);
  }

  await tx.equipmentItem.update({ where: { id: childId }, data: { parentId } });
  await writeState(
    tx,
    child,
    { assignedSoldierId: parent.assignedSoldierId, status: parent.status, platoon: parent.platoon },
    { note: `צורף כרכיב של ${itemLabel(parent)}`, userId },
  );
}

/** Detach a component. It keeps its current holder/status; from now on it moves independently. */
export async function detachComponent(tx: Tx, childId: string, userId: string) {
  const child = await tx.equipmentItem.findUnique({
    where: { id: childId },
    select: {
      id: true,
      companyId: true,
      assignedSoldierId: true,
      status: true,
      platoon: true,
      parent: { select: { serialNumber: true, category: { select: { name: true } } } },
    },
  });
  if (!child?.parent) throw new AssignmentError("הפריט אינו רכיב");
  await tx.equipmentItem.update({ where: { id: childId }, data: { parentId: null } });
  await writeState(tx, child, child, { note: `נותק מ${itemLabel(child.parent)}`, userId });
}
