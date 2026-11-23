import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Company scoping (multi-tenancy) and deployment scoping. Companies share nothing; within a
// company, who-holds-what, the kits and the ammo belong to one deployment (הפעלה).
// App code talks to the database through scopedDb(...), never through `prisma` directly
// (exceptions: login, the super-admin screens, and the seed, which work across companies).
//
// scopedDb(companyId, deploymentId?)
//   - every model in SCOPED_MODELS: `companyId` is added to the `where` of every read, update
//     and delete (including findUnique), filled in on creates, and a create/update naming another
//     company throws.
//   - deploymentId given (string): the same for DEPLOYMENT_MODELS and `deploymentId`.
//   - deploymentId null ("no deployment"): DEPLOYMENT_MODELS read as empty and can't be written.
//   - deploymentId omitted: no deployment filter — only for deployment management (start, copy,
//     close), which works across a company's deployments.
// Relations reached through include/select follow foreign keys from rows that already passed
// the filter. Nested relation filters (e.g. `assignments: { some: … }` on an item) are NOT
// rewritten — pass the deploymentId explicitly there. IDs taken from user input must still be
// loaded through this client before use (another company's / deployment's row reads as missing).
// Raw SQL ($queryRaw / $executeRaw) is NOT scoped — add the conditions by hand.

/** Models that carry companyId. Keep in sync with prisma/schema.prisma. */
export const SCOPED_MODELS = new Set([
  "User",
  "Soldier",
  "Deployment",
  "EquipmentCategory",
  "EquipmentItem",
  "EquipmentAssignment",
  "EquipmentLog",
  "AmmoStock",
  "AmmoLog",
  "PersonalKit",
  "KitInspection",
  "KitReturn",
  "KitItemDef",
  "KitItemStatus",
  "StorageItem",
  "EquipmentSet",
  "EquipmentSetSlot",
  "Platoon",
  "DeploymentAbsence",
]);

/** Models that belong to one deployment (deploymentId NOT NULL). */
export const DEPLOYMENT_MODELS = new Set(["EquipmentAssignment", "PersonalKit", "AmmoStock", "DeploymentAbsence"]);

/** Matches no row: what a deployment-scoped read sees when there is no deployment. */
const NO_DEPLOYMENT = "__no_deployment__";

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);

export class CrossCompanyError extends Error {
  constructor(model: string, operation: string, what = "company") {
    super(`Cross-${what} ${operation} on ${model} rejected`);
  }
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

type Scope = { key: "companyId" | "deploymentId"; value: string; relation: "company" | "deployment" };

function scopeWhere(where: Record<string, unknown> | undefined, scopes: Scope[], model: string, operation: string) {
  let out = { ...where };
  for (const s of scopes) {
    if (s.key in out && out[s.key] !== undefined && out[s.key] !== s.value) {
      throw new CrossCompanyError(model, operation, s.relation);
    }
    out = { ...out, [s.key]: s.value };
  }
  return out;
}

function scopeCreateData(row: unknown, scopes: Scope[], model: string, operation: string) {
  let data = { ...(row as Record<string, unknown>) };
  for (const s of scopes) {
    if (s.value === NO_DEPLOYMENT) throw new CrossCompanyError(model, operation, "deployment (none active)");
    if (data[s.key] !== undefined && data[s.key] !== s.value) throw new CrossCompanyError(model, operation, s.relation);
    if (data[s.relation] !== undefined) throw new CrossCompanyError(model, operation, s.relation); // relation-style connect
    data = { ...data, [s.key]: s.value };
  }
  return data;
}

function guardUpdateData(data: unknown, scopes: Scope[], model: string, operation: string) {
  const d = data as Record<string, unknown> | undefined;
  if (!d) return;
  for (const s of scopes) {
    if ((d[s.key] !== undefined && d[s.key] !== s.value) || d[s.relation] !== undefined) {
      throw new CrossCompanyError(model, operation, s.relation);
    }
  }
}

export function scopedDb(companyId: string, deploymentId?: string | null): PrismaClient {
  if (!companyId) throw new Error("scopedDb: companyId is required");
  const deployment = deploymentId === undefined ? undefined : (deploymentId ?? NO_DEPLOYMENT);

  const client = prisma.$extends({
    name: "company-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const scopes: Scope[] = [{ key: "companyId", value: companyId, relation: "company" }];
          if (deployment !== undefined && DEPLOYMENT_MODELS.has(model)) {
            scopes.push({ key: "deploymentId", value: deployment, relation: "deployment" });
          }
          const a = { ...(args as Args) };

          if (CREATE_OPS.has(operation)) {
            a.data = Array.isArray(a.data)
              ? a.data.map((row) => scopeCreateData(row, scopes, model, operation))
              : scopeCreateData(a.data, scopes, model, operation);
            return query(a);
          }

          a.where = scopeWhere(a.where, scopes, model, operation);
          if (UPDATE_OPS.has(operation)) guardUpdateData(a.data, scopes, model, operation);
          if (operation === "upsert") {
            a.create = scopeCreateData(a.create, scopes, model, operation);
            guardUpdateData(a.update, scopes, model, operation);
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
