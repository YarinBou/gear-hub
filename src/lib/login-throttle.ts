import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Database-backed login throttling. Works on serverless because the counter lives in Postgres,
// not in the memory of one function instance.

export const MAX_FAILURES_PER_USERNAME = 5;
export const MAX_FAILURES_PER_IP = 20;
export const LOCKOUT_WINDOW_MINUTES = 15;
const RETENTION_HOURS = 24;

/** Client IP as seen by Vercel / a reverse proxy. Best-effort — used only for throttling. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

/** Minutes until the caller may try again, or 0 if not locked. */
export async function lockedForMinutes(username: string, ip: string | null): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000);
  const [byUser, byIp] = await Promise.all([
    prisma.loginAttempt.findMany({
      where: { username, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    ip
      ? prisma.loginAttempt.findMany({
          where: { ip, success: false, createdAt: { gte: since } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  // The lock lifts when the oldest failure that pushed the count over the limit leaves the window.
  const unlockAt = (rows: { createdAt: Date }[], max: number) =>
    rows.length >= max ? rows[rows.length - max].createdAt.getTime() + LOCKOUT_WINDOW_MINUTES * 60_000 : 0;
  const until = Math.max(unlockAt(byUser, MAX_FAILURES_PER_USERNAME), unlockAt(byIp, MAX_FAILURES_PER_IP));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60_000) : 0;
}

export async function recordAttempt(username: string, ip: string | null, success: boolean) {
  if (success) {
    // A successful login clears that username's failure streak.
    await prisma.loginAttempt.deleteMany({ where: { username, success: false } });
  }
  await prisma.loginAttempt.create({ data: { username, ip, success } });
  // Opportunistic pruning keeps the table small without a cron job.
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_HOURS * 3_600_000) } },
  });
}

/** Used by an admin password reset: lets the user in immediately with the new password. */
export async function clearFailures(username: string) {
  await prisma.loginAttempt.deleteMany({ where: { username, success: false } });
}
