"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth";
import { getClientIp, lockedForMinutes, recordAttempt } from "@/lib/login-throttle";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string } | undefined;

const LoginSchema = z.object({
  username: z.string().trim().min(1, "יש להזין שם משתמש").max(60),
  password: z.string().min(1, "יש להזין סיסמה").max(200),
  next: z.string().optional(),
});

// A real bcrypt hash (same cost) to compare against when the username doesn't exist,
// so a wrong username takes as long as a wrong password (no username enumeration by timing).
// Created once per server instance, on first use.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

const INVALID = "שם משתמש או סיסמה שגויים";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "פרטים שגויים" };
  }
  const { password, next } = parsed.data;
  const username = parsed.data.username.toLowerCase();
  const ip = await getClientIp();

  const minutes = await lockedForMinutes(username, ip);
  if (minutes > 0) {
    return { error: `יותר מדי ניסיונות כניסה כושלים. נסו שוב בעוד ${minutes} דקות.` };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  const ok = !!user && user.isActive && passwordOk;
  await recordAttempt(username, ip, ok);
  if (!ok || !user) return { error: INVALID };

  await createSession({ userId: user.id, role: user.role, name: user.name });
  // Only allow same-site relative redirects.
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
