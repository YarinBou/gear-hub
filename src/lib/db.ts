import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Company scoping (multi-tenancy). Companies share nothing, and this is where that's enforced:
// app code talks to the database through scopedDb(companyId), never through `prisma` directly
// (exceptions: login, the super-admin screens, and the seed, which work across companies).
//
// For every model in SCOPED_MODELS the client
//   - adds `companyId` to the `where` of every read, update and delete (including findUnique),
//   - fills in `companyId` on creates, and throws if a create or update names another company.
// Relations reached through include/select follow foreign keys from rows that already passed
// the filter. IDs taken from user input must still be loaded through this client before use
// (a findFirst/findUnique here returns null for another company's row).
// Raw SQL ($queryRaw / $executeRaw) is NOT scoped — add the companyId condition by hand.

/** Models that carry companyId. Keep in sync with prisma/schema.prisma. */
export const SCOPED_MODELS = new Set([
  "User",
  "Soldier",
  "EquipmentCategory",
  "EquipmentItem",
  "EquipmentLog",
  "AmmoStock",
  "AmmoLog",
  "PersonalKit",
  "KitInspection",
  "StorageItem",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);

export class CrossCompanyError extends Error {
  constructor(model: string, operation: string) {
    super(`Cross-company ${operation} on ${model} rejected`);
  }
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function scopeWhere(where: Record<string, unknown> | undefined, companyId: string, model: string, operation: string) {
  if (where && "companyId" in where && where.companyId !== undefined && where.companyId !== companyId) {
    throw new CrossCompanyError(model, operation);
  }
  return { ...where, companyId };
}

function scopeCreateData(row: unknown, companyId: string, model: string, operation: string) {
  const data = row as Record<string, unknown>;
  if (data.companyId !== undefined && data.companyId !== companyId) throw new CrossCompanyError(model, operation);
  if (data.company !== undefined) throw new CrossCompanyError(model, operation); // relation-style connect not allowed
  return { ...data, companyId };
}

function guardUpdateData(data: unknown, companyId: string, model: string, operation: string) {
  const d = data as Record<string, unknown> | undefined;
  if (d && ((d.companyId !== undefined && d.companyId !== companyId) || d.company !== undefined)) {
    throw new CrossCompanyError(model, operation);
  }
}

export function scopedDb(companyId: string): PrismaClient {
  if (!companyId) throw new Error("scopedDb: companyId is required");
  const client = prisma.$extends({
    name: "company-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const a = { ...(args as Args) };

          if (CREATE_OPS.has(operation)) {
            a.data = Array.isArray(a.data)
              ? a.data.map((row) => scopeCreateData(row, companyId, model, operation))
              : scopeCreateData(a.data, companyId, model, operation);
            return query(a);
          }

          a.where = scopeWhere(a.where, companyId, model, operation);
          if (UPDATE_OPS.has(operation)) guardUpdateData(a.data, companyId, model, operation);
          if (operation === "upsert") {
            a.create = scopeCreateData(a.create, companyId, model, operation);
            guardUpdateData(a.update, companyId, model, operation);
          }
          return query(a);
        },
      },
    },
  });
  // A query-only extension doesn't change any model types, so the plain client type is accurate
  // (and keeps Prisma.TransactionClient-typed helpers such as applyAssignment compatible).
  return client as unknown as PrismaClient;
}
