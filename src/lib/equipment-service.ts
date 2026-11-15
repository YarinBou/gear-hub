import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { itemLabel, resolveStatus } from "@/lib/equipment-rules";

// Single place that changes who holds an item / its status / platoon, and writes the history log.
// Every module that moves equipment (צל"ם page, bulk actions, kit sign-out) must go through here.
//
// State lives per deployment in EquipmentAssignment (one row per item per deployment); the item
// itself is only the physical thing. All functions work on one deployment (`ctx.deploymentId`)
// and expect a transaction client scoped to the company and that deployment.
//
// Linked sets: an item may have components (e.g. a נגב with its ציין and קנס"פ). Components always
// mirror their parent's holder / status / platoon, so moving the parent moves the whole set, and a
// component can't be moved on its own while attached.

type Tx = Prisma.TransactionClient;

/** The deployment being changed and who is changing it. */
export type DeploymentCtx = { companyId: string; deploymentId: string; userId: string };

export type AssignmentInput = {
  /** undefined = keep current holder; null = return to company (no soldier) */
  soldierId?: string | null;
  status?: EquipmentStatus;
  /** Only used when the item has no soldier. undefined = keep; null = no platoon. */
  platoonId?: string | null;
  note?: string;
  verify?: boolean;
};

export class AssignmentError extends Error {}

type State = { soldierId: string | null; status: EquipmentStatus; platoonId: string | null };
type Row = State & { id: string; itemId: string };

const rowSelect = { id: true, itemId: true, soldierId: true, status: true, platoonId: true } as const;

/** The item's state row in this deployment (created with defaults if missing). */
export async function ensureAssignment(tx: Tx, ctx: DeploymentCtx, itemId: string): Promise<Row> {
  return tx.equipmentAssignment.upsert({
    where: { deploymentId_itemId: { deploymentId: ctx.deploymentId, itemId } },
    update: {},
    create: { companyId: ctx.companyId, deploymentId: ctx.deploymentId, itemId },
    select: rowSelect,
  });
}

/** Set one item's holder/status/platoon and log the change. No rules — callers decide the target state. */
async function writeState(tx: Tx, ctx: DeploymentCtx, row: Row, next: State, opts: { note?: string; verify?: boolean }) {
  const changed = next.soldierId !== row.soldierId || next.status !== row.status || next.platoonId !== row.platoonId;
  await tx.equipmentAssignment.update({
    where: { id: row.id },
    // Pick the three fields explicitly — callers may pass a whole record as `next`.
    data: {
      soldierId: next.soldierId,
      status: next.status,
      platoonId: next.platoonId,
      ...(opts.verify ? { lastVerifiedAt: new Date() } : {}),
    },
  });
  if (changed || opts.note) {
    await tx.equipmentLog.create({
      data: {
        companyId: ctx.companyId,
        deploymentId: ctx.deploymentId,
        itemId: row.itemId,
        fromSoldierId: row.soldierId,
        toSoldierId: next.soldierId,
        fromStatus: row.status,
        toStatus: next.status,
        platoonId: next.platoonId,
        note: opts.note,
        performedById: ctx.userId,
      },
    });
  }
  return changed;
}

/** Copy a parent's state onto all its components (with a history entry on each that changed). */
async function syncComponents(
  tx: Tx,
  ctx: DeploymentCtx,
  parent: { id: string; serialNumber: string | null; category: { name: string } },
  next: State,
  opts: { verify?: boolean },
) {
  const components = await tx.equipmentItem.findMany({ where: { parentId: parent.id }, select: { id: true } });
  const note = `עבר יחד עם ${itemLabel(parent)}`;
  for (const c of components) {
    const row = await ensureAssignment(tx, ctx, c.id);
    const moves = row.soldierId !== next.soldierId || row.status !== next.status || row.platoonId !== next.platoonId;
    // Only components that actually move get a history entry (explaining why).
    await writeState(tx, ctx, row, next, { ...opts, note: moves ? note : undefined });
  }
}

export async function applyAssignment(tx: Tx, ctx: DeploymentCtx, itemId: string, input: AssignmentInput) {
  // With a company-scoped client, another company's item reads as "not found".
  const item = await tx.equipmentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      serialNumber: true,
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
  const row = await ensureAssignment(tx, ctx, item.id);

  const soldierId = input.soldierId === undefined ? row.soldierId : input.soldierId;
  let platoonId: string | null;

  if (soldierId) {
    const soldier = await tx.soldier.findUnique({ where: { id: soldierId }, select: { platoonId: true, isActive: true } });
    if (!soldier) throw new AssignmentError("הלוחם לא נמצא");
    if (!soldier.isActive && soldierId !== row.soldierId) {
      throw new AssignmentError('לא ניתן לשייך ללוחם שהוצא מהסד"כ');
    }
    if (soldierId !== row.soldierId) await assertInDeployment(tx, ctx.deploymentId, soldierId);
    platoonId = soldier.platoonId; // auto-filled from the holder
  } else {
    platoonId = input.platoonId === undefined ? row.platoonId : input.platoonId;
    // Must be one of this company's platoons (another company's reads as missing).
    if (platoonId && platoonId !== row.platoonId && !(await tx.platoon.findUnique({ where: { id: platoonId }, select: { id: true } }))) {
      throw new AssignmentError("המחלקה לא נמצאה");
    }
  }

  const resolved = resolveStatus({ current: row.status, requested: input.status, hasSoldier: !!soldierId });
  if ("error" in resolved) throw new AssignmentError(resolved.error);

  const next: State = { soldierId, status: resolved.status, platoonId };
  const changed = await writeState(tx, ctx, row, next, { note: input.note, verify: input.verify });
  await syncComponents(tx, ctx, item, next, { verify: input.verify });
  return { changed };
}

const linkSelect = {
  id: true,
  serialNumber: true,
  parentId: true,
  category: { select: { name: true } },
  _count: { select: { components: true } },
} as const;

/**
 * Attach `childId` as a component of `parentId`. The child takes the parent's holder/status/platoon
 * in the given deployment (if any — without a deployment only the link is recorded).
 * Rules: one level only; the child may not be held by a different soldier than the parent.
 */
export async function attachComponent(tx: Tx, ctx: DeploymentCtx | null, parentId: string, childId: string) {
  if (parentId === childId) throw new AssignmentError("לא ניתן לצרף פריט לעצמו");
  const [parent, child] = await Promise.all([
    tx.equipmentItem.findUnique({ where: { id: parentId }, select: linkSelect }),
    tx.equipmentItem.findUnique({ where: { id: childId }, select: linkSelect }),
  ]);
  if (!parent || !child) throw new AssignmentError("הפריט לא נמצא");
  if (parent.parentId) throw new AssignmentError("פריט שהוא רכיב לא יכול לשמש כפריט ראשי");
  if (child.parentId) throw new AssignmentError(`${itemLabel(child)} כבר משויך כרכיב של פריט אחר`);
  if (child._count.components) throw new AssignmentError(`ל${itemLabel(child)} יש רכיבים משלו`);

  if (!ctx) {
    await tx.equipmentItem.update({ where: { id: childId }, data: { parentId } });
    return;
  }
  const [parentRow, childRow] = [await ensureAssignment(tx, ctx, parent.id), await ensureAssignment(tx, ctx, child.id)];
  if (childRow.soldierId && childRow.soldierId !== parentRow.soldierId) {
    const holder = await tx.soldier.findUnique({ where: { id: childRow.soldierId }, select: { name: true } });
    throw new AssignmentError(`${itemLabel(child)} מוחזק ע"י ${holder?.name ?? "לוחם אחר"}`);
  }
  await tx.equipmentItem.update({ where: { id: childId }, data: { parentId } });
  await writeState(tx, ctx, childRow, parentRow, { note: `צורף כרכיב של ${itemLabel(parent)}` });
}

/** Detach a component. It keeps its current holder/status; from now on it moves independently. */
export async function detachComponent(tx: Tx, ctx: DeploymentCtx | null, childId: string) {
  const child = await tx.equipmentItem.findUnique({
    where: { id: childId },
    select: { id: true, parent: { select: { serialNumber: true, category: { select: { name: true } } } } },
  });
  if (!child?.parent) throw new AssignmentError("הפריט אינו רכיב");
  await tx.equipmentItem.update({ where: { id: childId }, data: { parentId: null } });
  if (ctx) {
    const row = await ensureAssignment(tx, ctx, child.id);
    await writeState(tx, ctx, row, row, { note: `נותק מ${itemLabel(child.parent)}` });
  }
}

/**
 * Create a new "ללא צ" item of `categoryId` as a component of `parentId` (a set line with no
 * serial recorded yet). In a deployment it takes the parent's holder / status / platoon.
 */
export async function createNoSerialComponent(
  tx: Tx,
  ctx: { companyId: string; userId: string; deploymentId: string | null },
  parentId: string,
  categoryId: string,
) {
  const [parent, category] = await Promise.all([
    tx.equipmentItem.findUnique({ where: { id: parentId }, select: linkSelect }),
    tx.equipmentCategory.findFirst({ where: { id: categoryId, domain: "EQUIPMENT" }, select: { id: true, name: true } }),
  ]);
  if (!parent) throw new AssignmentError("הפריט לא נמצא");
  if (parent.parentId) throw new AssignmentError("פריט שהוא רכיב לא יכול לשמש כפריט ראשי");
  if (!category) throw new AssignmentError("סוג הרכיב לא נמצא");

  const item = await tx.equipmentItem.create({
    data: { companyId: ctx.companyId, categoryId: category.id, serialNumber: null, parentId: parent.id },
    select: { id: true },
  });
  const note = `נקלט במערכת (ללא צ) כרכיב של ${itemLabel(parent)}`;
  if (!ctx.deploymentId) {
    await tx.equipmentLog.create({
      data: { companyId: ctx.companyId, itemId: item.id, toStatus: "IN_ARMORY", note, performedById: ctx.userId },
    });
    return item;
  }
  const parentRow = await ensureAssignment(tx, { ...ctx, deploymentId: ctx.deploymentId }, parent.id);
  await tx.equipmentAssignment.create({
    data: {
      companyId: ctx.companyId,
      deploymentId: ctx.deploymentId,
      itemId: item.id,
      soldierId: parentRow.soldierId,
      status: parentRow.status,
      platoonId: parentRow.platoonId,
    },
  });
  await tx.equipmentLog.create({
    data: {
      companyId: ctx.companyId,
      deploymentId: ctx.deploymentId,
      itemId: item.id,
      toSoldierId: parentRow.soldierId,
      toStatus: parentRow.status,
      platoonId: parentRow.platoonId,
      note,
      performedById: ctx.userId,
    },
  });
  return item;
}

export type SignOutSetInput = {
  setId: string;
  soldierId: string;
  mainItemId: string;
  componentIds: string[];
  newComponentCategoryIds: string[];
  note?: string;
};

/**
 * Sign a set (מארז) out to a soldier in one go: the main item is assigned to the soldier, the chosen
 * items are attached as its components (they follow it from now on), missing pieces can be created
 * "ללא צ", and the main item records which set it is. All or nothing.
 */
export async function signOutSet(tx: Tx, ctx: DeploymentCtx, input: SignOutSetInput) {
  const set = await tx.equipmentSet.findUnique({
    where: { id: input.setId },
    select: { id: true, name: true, mainCategoryId: true, slots: { select: { categoryId: true } } },
  });
  if (!set) throw new AssignmentError("המארז לא נמצא");
  const main = await tx.equipmentItem.findUnique({
    where: { id: input.mainItemId },
    select: { id: true, categoryId: true, parentId: true },
  });
  if (!main) throw new AssignmentError("הפריט הראשי לא נמצא");
  if (main.categoryId !== set.mainCategoryId) throw new AssignmentError("הפריט הראשי אינו מהסוג שהמארז מגדיר");
  if (main.parentId) throw new AssignmentError("הפריט הראשי משויך כרכיב של פריט אחר — יש לנתק אותו תחילה");
  if (new Set(input.componentIds).size !== input.componentIds.length || input.componentIds.includes(main.id)) {
    throw new AssignmentError("אותו פריט נבחר פעמיים");
  }
  // Pieces created "ללא צ" must be of the set's types (attached existing items may be anything — תוספות).
  const slotTypes = new Set(set.slots.map((s) => s.categoryId));
  if (input.newComponentCategoryIds.some((c) => !slotTypes.has(c))) throw new AssignmentError("סוג רכיב שאינו במארז");

  // The main item first, so the components take its new holder when they're attached.
  await applyAssignment(tx, ctx, main.id, { soldierId: input.soldierId, note: input.note ?? `הוחתם כמארז "${set.name}"` });
  for (const childId of input.componentIds) await attachComponent(tx, ctx, main.id, childId);
  for (const categoryId of input.newComponentCategoryIds) await createNoSerialComponent(tx, ctx, main.id, categoryId);
  await tx.equipmentItem.update({ where: { id: main.id }, data: { setId: set.id } });
  return { mainItemId: main.id };
}

export const NOT_IN_DEPLOYMENT_MESSAGE = "הלוחם לא משתתף בהפעלה הזו — ניתן לסמן אותו כמשתתף במסך המשתתפים";

/** Refuse a soldier who is marked as not part of the deployment (DeploymentAbsence). */
export async function assertInDeployment(tx: Tx, deploymentId: string, soldierId: string) {
  const absent = await tx.deploymentAbsence.findFirst({ where: { deploymentId, soldierId }, select: { id: true } });
  if (absent) throw new AssignmentError(NOT_IN_DEPLOYMENT_MESSAGE);
}
