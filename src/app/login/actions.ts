"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

const LoginSchema = z.object({
  username: z.string().trim().min(1, "יש להזין שם משתמש"),
  password: z.string().min(1, "יש להזין סיסמה"),
  next: z.string().optional(),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "פרטים שגויים" };
  }
  const { username, password, next } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return { error: "שם משתמש או סיסמה שגויים" };

  await createSession({ userId: user.id, role: user.role, name: user.name });
  // Only allow same-site relative redirects.
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
