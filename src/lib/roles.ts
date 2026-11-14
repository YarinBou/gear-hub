import type { Role } from "@/generated/prisma/enums";

// Pure role helpers — safe for client and server.

/** May manage a company's catalog and users. A SUPER_ADMIN working inside a company counts too. */
export function isCompanyAdmin(role: Role) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Roles a company admin may give to users of their own company. */
export const COMPANY_ROLES = ["ADMIN", "REGULAR"] as const satisfies readonly Role[];
