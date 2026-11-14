import type { Platoon, Role } from "@/generated/prisma/enums";

// Stand-in for src/lib/auth.ts in integration tests. Same exports, but the "session" is whatever
// the test set with signInAs(). Keep the exported names in sync with the real module.

export type TestUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  platoon: Platoon | null;
  isActive: boolean;
};

/** Thrown where the real code would call redirect(); tests can assert on `url`. */
export class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect → ${url}`);
  }
}

let current: TestUser | null = null;

export function signInAs(user: TestUser) {
  current = user;
}

export function signOut() {
  current = null;
}

export async function requireUser() {
  if (!current || !current.isActive) throw new RedirectSignal("/login");
  return current;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new RedirectSignal("/");
  return user;
}

export async function getSession() {
  return current ? { userId: current.id, role: current.role, name: current.name } : null;
}

export async function createSession() {}
export async function deleteSession() {}
