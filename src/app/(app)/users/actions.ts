"use server";

import { refresh } from "next/cache";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { adminContext } from "@/lib/context";
import { clearFailures } from "@/lib/login-throttle";
import { generateTempPassword, hashPassword } from "@/lib/passwords";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";
import { CreateUserSchema, UserFieldsSchema } from "@/lib/validation/user";

export type UserFormState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      errors?: FieldErrors;
      /** Shown once to the admin, never stored in plain text. */
      tempPassword?: { username: string; password: string };
      at?: number;
    }
  | undefined;

function read(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, fd.get(k) ?? ""]));
}

/** Active admins of the company `db` is scoped to (a SUPER_ADMIN has no company, so never counts). */
async function activeAdminCount(db: PrismaClient, excludeId?: string) {
  return db.user.count({ where: { role: "ADMIN", isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
}

/** A platoon id from the form → that platoon if it's this company's (`db` is company-scoped), else none. */
async function validPlatoon(db: PrismaClient, id: string | undefined) {
  if (!id) return null;
  return (await db.platoon.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
}

export async function createUser(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const { user: me, db } = await adminContext();
  const parsed = CreateUserSchema.safeParse(read(fd, ["name", "username", "role", "platoon"]));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { name, username, role, platoon } = parsed.data;

  const password = generateTempPassword();
  try {
    await db.user.create({
      data: {
        companyId: me.companyId,
        name,
        username,
        role: role as Role,
        platoonId: await validPlatoon(db, platoon),
        passwordHash: await hashPassword(password),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { errors: { username: "שם המשתמש תפוס" } };
    }
    throw e;
  }
  refresh();
  return { ok: true, message: `המשתמש ${name} נוצר`, tempPassword: { username, password }, at: Date.now() };
}

export async function updateUser(id: string, _prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const { user: me, db } = await adminContext();
  const parsed = UserFieldsSchema.safeParse(read(fd, ["name", "role", "platoon"]));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const role = parsed.data.role as Role;

  if (role !== "ADMIN") {
    if (id === me.id) return { error: "לא ניתן להסיר הרשאת מנהל מעצמך" };
    if ((await activeAdminCount(db, id)) === 0) return { error: "חייב להישאר לפחות מנהל פעיל אחד" };
  }
  await db.user.update({
    where: { id },
    data: { name: parsed.data.name, role, platoonId: await validPlatoon(db, parsed.data.platoon) },
  });
  refresh();
  return { ok: true, message: "נשמר", at: Date.now() };
}

export type SimpleResult = { ok: boolean; message?: string; tempPassword?: { username: string; password: string } };

/** Deactivate / reactivate. Deactivated users are signed out on their next request (requireUser checks the DB). */
export async function setUserActive(id: string, active: boolean): Promise<SimpleResult> {
  const { user: me, db } = await adminContext();
  if (!active) {
    if (id === me.id) return { ok: false, message: "לא ניתן להשבית את המשתמש שלך" };
    const target = await db.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "ADMIN" && (await activeAdminCount(db, id)) === 0) {
      return { ok: false, message: "חייב להישאר לפחות מנהל פעיל אחד" };
    }
  }
  await db.user.update({ where: { id }, data: { isActive: active } });
  refresh();
  return { ok: true };
}

export async function resetPassword(id: string): Promise<SimpleResult> {
  const { db } = await adminContext();
  const user = await db.user.findUnique({ where: { id }, select: { username: true } });
  if (!user) return { ok: false, message: "המשתמש לא נמצא" };
  const password = generateTempPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  // A locked-out user is usually why the reset happened — let them in right away.
  await clearFailures(user.username);
  return { ok: true, tempPassword: { username: user.username, password } };
}
