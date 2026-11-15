"use server";

import { refresh, updateTag } from "next/cache";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { adminContext } from "@/lib/context";
import { nextColor } from "@/lib/platoons";
import { platoonsTag } from "@/lib/queries/platoons";
import { soldiersTag } from "@/lib/queries/soldiers";

// Admin: the company's platoons (מחלקות) — how many and what they're called. A platoon that's in
// use (soldiers, users, equipment, history) is never deleted; it can be deactivated once no active
// soldier is in it.

export type PlatoonResult = { ok: boolean; message?: string };

const MAX_PLATOONS = 30;

function done(companyId: string, message?: string): PlatoonResult {
  updateTag(platoonsTag(companyId));
  updateTag(soldiersTag(companyId)); // soldier pickers group by platoon name
  refresh();
  return { ok: true, message };
}

function cleanName(raw: unknown) {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** The first "מחלקה N" not taken yet. */
function freeName(taken: string[]) {
  for (let n = 1; ; n++) if (!taken.includes(`מחלקה ${n}`)) return `מחלקה ${n}`;
}

async function usage(db: PrismaClient, id: string) {
  const [soldiers, activeSoldiers, users, assignments, logs] = await Promise.all([
    db.soldier.count({ where: { platoonId: id } }),
    db.soldier.count({ where: { platoonId: id, isActive: true } }),
    db.user.count({ where: { platoonId: id } }),
    db.equipmentAssignment.count({ where: { platoonId: id } }),
    db.equipmentLog.count({ where: { platoonId: id } }),
  ]);
  return { activeSoldiers, inUse: soldiers + users + assignments + logs > 0 };
}

export async function createPlatoon(nameRaw: string): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  const all = await db.platoon.findMany({ select: { name: true, sortOrder: true, color: true } });
  if (all.length >= MAX_PLATOONS) return { ok: false, message: `לכל היותר ${MAX_PLATOONS} מחלקות` };
  const name = cleanName(nameRaw) || freeName(all.map((p) => p.name));
  if (name.length > 40) return { ok: false, message: "השם ארוך מדי" };
  try {
    await db.platoon.create({
      data: {
        companyId: user.companyId,
        name,
        sortOrder: Math.max(0, ...all.map((p) => p.sortOrder)) + 10,
        color: nextColor(all.map((p) => p.color)),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: `כבר קיימת מחלקה בשם "${name}"` };
    throw e;
  }
  return done(user.companyId, `"${name}" נוספה`);
}

export async function renamePlatoon(id: string, nameRaw: string): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  const name = cleanName(nameRaw);
  if (!name) return { ok: false, message: "יש להזין שם" };
  if (name.length > 40) return { ok: false, message: "השם ארוך מדי" };
  try {
    await db.platoon.update({ where: { id }, data: { name } });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: `כבר קיימת מחלקה בשם "${name}"` };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, message: "המחלקה לא נמצאה" };
    throw e;
  }
  return done(user.companyId);
}

/** Swap with the neighbour among active platoons. */
export async function movePlatoon(id: string, direction: "up" | "down"): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  const list = await db.platoon.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const i = list.findIndex((p) => p.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: false };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber the whole list — keeps orders distinct even after imports or equal values.
  await db.$transaction(list.map((p, k) => db.platoon.update({ where: { id: p.id }, data: { sortOrder: (k + 1) * 10 } })));
  return done(user.companyId);
}

export async function setPlatoonActive(id: string, active: boolean): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  if (typeof active !== "boolean") return { ok: false };
  if (!active) {
    const { activeSoldiers } = await usage(db, id);
    if (activeSoldiers) return { ok: false, message: `יש במחלקה ${activeSoldiers} לוחמים — יש להעביר אותם למחלקה אחרת תחילה` };
    if ((await db.platoon.count({ where: { isActive: true } })) <= 1) return { ok: false, message: "חייבת להישאר לפחות מחלקה פעילה אחת" };
  }
  await db.platoon.update({ where: { id }, data: { isActive: active } });
  return done(user.companyId);
}

/** Only a platoon nothing refers to (no soldiers, users, equipment or history). */
export async function deletePlatoon(id: string): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  const p = await db.platoon.findUnique({ where: { id }, select: { name: true, isActive: true } });
  if (!p) return { ok: false, message: "המחלקה לא נמצאה" };
  if ((await usage(db, id)).inUse) return { ok: false, message: "המחלקה בשימוש (לוחמים, משתמשים או היסטוריית ציוד) — ניתן להשבית אותה במקום" };
  if (p.isActive && (await db.platoon.count({ where: { isActive: true } })) <= 1) {
    return { ok: false, message: "חייבת להישאר לפחות מחלקה פעילה אחת" };
  }
  await db.platoon.delete({ where: { id } });
  return done(user.companyId, `"${p.name}" נמחקה`);
}

/**
 * Set how many active platoons the company has. Growing adds "מחלקה N" rows (rename them after);
 * shrinking removes the last ones — deleted when unused, deactivated when they only have history,
 * refused when soldiers are still in them.
 */
export async function setPlatoonCount(countRaw: number): Promise<PlatoonResult> {
  const { user, db } = await adminContext();
  const count = Math.floor(Number(countRaw));
  if (!Number.isFinite(count) || count < 1 || count > MAX_PLATOONS) return { ok: false, message: `מספר בין 1 ל-${MAX_PLATOONS}` };
  const all = await db.platoon.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true, color: true, isActive: true } });
  const active = all.filter((p) => p.isActive);

  if (count > active.length) {
    const names = all.map((p) => p.name);
    const colors = all.map((p) => p.color);
    let order = Math.max(0, ...all.map((p) => p.sortOrder));
    const data = [];
    for (let n = active.length; n < count; n++) {
      const name = freeName(names);
      const color = nextColor(colors);
      names.push(name);
      colors.push(color);
      data.push({ companyId: user.companyId, name, sortOrder: (order += 10), color });
    }
    await db.platoon.createMany({ data });
    return done(user.companyId, `נוספו ${data.length} מחלקות — אפשר לשנות להן שם`);
  }

  if (count < active.length) {
    const extra = active.slice(count);
    const blocked: string[] = [];
    for (const p of extra) {
      const u = await usage(db, p.id);
      if (u.activeSoldiers) blocked.push(`${p.name} (${u.activeSoldiers} לוחמים)`);
    }
    if (blocked.length) return { ok: false, message: `יש להעביר קודם את הלוחמים מ: ${blocked.join(", ")}` };
    for (const p of extra) {
      if ((await usage(db, p.id)).inUse) await db.platoon.update({ where: { id: p.id }, data: { isActive: false } });
      else await db.platoon.delete({ where: { id: p.id } });
    }
    return done(user.companyId, `הוסרו ${extra.length} מחלקות`);
  }
  return { ok: true };
}
