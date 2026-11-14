"use server";

import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";
import { ChangePasswordSchema } from "@/lib/validation/user";

export type PasswordState = { ok?: boolean; message?: string; errors?: FieldErrors; at?: number } | undefined;

export async function changePassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const me = await requireUser();
  const parsed = ChangePasswordSchema.safeParse({
    current: fd.get("current") ?? "",
    next: fd.get("next") ?? "",
    confirm: fd.get("confirm") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { errors: { current: "הסיסמה הנוכחית שגויה" } };
  }
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true, message: "הסיסמה עודכנה", at: Date.now() };
}
