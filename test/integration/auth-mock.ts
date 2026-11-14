import { ACTIVE_COMPANY_COOKIE, encryptSession, SESSION_COOKIE } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";

// Integration tests run the REAL auth layer (src/lib/auth.ts). Only Next's request APIs are faked:
// `cookies()` reads this in-memory jar (wired up in setup.ts), and redirect() throws RedirectSignal.
// signInAs() puts a genuinely signed session token in the jar, exactly like a login would.

/** Thrown where the real code would call redirect(); tests can assert on `url`. */
export class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect → ${url}`);
  }
}

const jar = new Map<string, string>();

export const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  has: (name: string) => jar.has(name),
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => {
    jar.set(name, value);
  },
  delete: (name: string) => {
    jar.delete(name);
  },
};

export type TestUser = { id: string; name: string; role: Role };

export async function signInAs(user: TestUser) {
  jar.set(SESSION_COOKIE, await encryptSession({ userId: user.id, role: user.role, name: user.name }));
}

/** SUPER_ADMIN: pick the company to work in (what "כניסה לפלוגה" does). */
export function chooseCompany(companyId: string | null) {
  if (companyId) jar.set(ACTIVE_COMPANY_COOKIE, companyId);
  else jar.delete(ACTIVE_COMPANY_COOKIE);
}

export function signOut() {
  jar.clear();
}
