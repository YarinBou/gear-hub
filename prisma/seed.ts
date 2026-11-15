import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
import { provisionCompany } from "../src/lib/company-setup";

// Idempotent seed — safe to re-run.
//   1. The system SUPER_ADMIN (manages companies).            SEED_SUPERADMIN_USERNAME / _PASSWORD
//   2. A first company with its default catalog and kits.      SEED_COMPANY_NAME
//   3. That company's first admin.                             SEED_ADMIN_USERNAME / _PASSWORD
//   4. Optional demo data in that company (SEED_DEMO=1).
// Further companies are created by the super-admin on /admin/companies.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: (process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)! }),
});

async function ensureUser(opts: {
  username: string;
  password: string | undefined;
  name: string;
  role: Role;
  companyId: string | null;
}) {
  const username = opts.username.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`• user "${username}" already exists — skipped`);
    return;
  }
  const password = opts.password || randomBytes(9).toString("base64url");
  await prisma.user.create({
    data: {
      username,
      name: opts.name,
      role: opts.role,
      companyId: opts.companyId,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`• created ${opts.role} "${username}"`);
  if (!opts.password) console.log(`  generated password: ${password}  (change it after first login)`);
}

async function seedCompany() {
  const name = process.env.SEED_COMPANY_NAME || "פלוגה א";
  const company = await prisma.company.upsert({ where: { name }, update: {}, create: { name } });
  await prisma.$transaction((tx) => provisionCompany(tx, company.id));
  console.log(`• company "${name}" ready (catalog, storage lines, kits)`);
  return company;
}

/** Optional demo data for local development (SEED_DEMO=1). */
async function seedDemo(companyId: string) {
  if (await prisma.soldier.count({ where: { companyId } })) {
    console.log("• soldiers exist — demo data skipped");
    return;
  }
  const platoons = (await prisma.platoon.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" } })).map((p) => p.id);
  const firstNames = ["יוסי", "דניאל", "איתי", "נועם", "עומר", "אביב", "רועי", "אורי", "תומר", "עידו"];
  const lastNames = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "דהן", "אזולאי", "שפירא"];

  const m16 = await prisma.equipmentCategory.findFirstOrThrow({ where: { companyId, domain: "EQUIPMENT", name: "M16" } });
  // The company's checklist (created by provisionCompany).
  const kitItems = await prisma.kitItemDef.findMany({ where: { companyId, isActive: true }, orderBy: { sortOrder: "asc" } });

  // Demo data lives in an active deployment (kits, holders and ammo belong to one).
  const deployment =
    (await prisma.deployment.findFirst({ where: { companyId, status: "ACTIVE" } })) ??
    (await prisma.deployment.create({
      data: { companyId, name: "הפעלת הדגמה", status: "ACTIVE", activeCompanyId: companyId },
    }));
  const deploymentId = deployment.id;
  await prisma.personalKit.createMany({
    data: Array.from({ length: (await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).kitCount }, (_, i) => ({
      companyId,
      deploymentId,
      kitNumber: i + 1,
    })),
    skipDuplicates: true,
  });

  for (let i = 0; i < 40; i++) {
    const platoonId = platoons[i % platoons.length];
    const soldier = await prisma.soldier.create({
      data: {
        companyId,
        name: `${firstNames[i % 10]} ${lastNames[(i * 3) % 10]}`,
        personalNumber: String(8_000_000 + i * 137),
        platoonId,
      },
    });
    const weapon = await prisma.equipmentItem.create({
      data: {
        companyId,
        serialNumber: `M16-${100200 + i}`,
        categoryId: m16.id,
        assignments: {
          create: {
            companyId,
            deploymentId,
            status: "WITH_SOLDIER",
            soldierId: soldier.id,
            platoonId,
            lastVerifiedAt: new Date(Date.now() - (i % 12) * 86_400_000),
          },
        },
      },
    });
    const kit = await prisma.personalKit.update({
      where: { deploymentId_kitNumber: { deploymentId, kitNumber: i + 1 } },
      data: { soldierId: soldier.id, personalWeaponId: weapon.id, rifleType: "M16", magazineCount: 7, ammoCount: 210 },
    });
    // A few gaps per kit, so the readiness grid has something to show.
    await prisma.kitItemStatus.createMany({
      data: kitItems.map((item, j) => ({ companyId, kitId: kit.id, itemId: item.id, present: (i + j) % 9 !== 0 })),
      skipDuplicates: true,
    });
  }

  const ammo = await prisma.equipmentCategory.findMany({ where: { companyId, domain: "AMMUNITION" } });
  for (const [i, a] of ammo.entries()) {
    await prisma.ammoStock.create({
      data: {
        companyId,
        deploymentId,
        categoryId: a.id,
        location: "בונקר פלוגתי",
        quantity: Math.round((a.minThreshold ?? 100) * (i % 3 === 0 ? 0.6 : 1.4)),
        lastCountedAt: new Date(),
      },
    });
  }

  const storage = await prisma.storageItem.findMany({ where: { companyId }, include: { category: true } });
  for (const [i, s] of storage.entries()) {
    await prisma.storageItem.update({
      where: { id: s.id },
      data: {
        currentQuantity: Math.round(s.targetQuantity * (i % 2 ? 1 : 0.8)),
        expiryDate: s.category.requiresExpiry ? new Date(Date.now() + (i * 20 - 10) * 86_400_000) : null,
      },
    });
  }
  console.log(`• demo data seeded in deployment "${deployment.name}" (40 soldiers, M16s, kits, ammo, storage)`);
}

async function main() {
  await ensureUser({
    username: process.env.SEED_SUPERADMIN_USERNAME ?? "superadmin",
    password: process.env.SEED_SUPERADMIN_PASSWORD,
    name: "מנהל מערכת",
    role: "SUPER_ADMIN",
    companyId: null,
  });
  const company = await seedCompany();
  // Only give the company a first admin if it has none (e.g. production already has its מ"פ).
  const hasAdmin = await prisma.user.count({ where: { companyId: company.id, role: "ADMIN" } });
  if (hasAdmin) console.log(`• company already has ${hasAdmin} admin(s) — no admin created`);
  else await ensureUser({
    username: process.env.SEED_ADMIN_USERNAME ?? "admin",
    password: process.env.SEED_ADMIN_PASSWORD,
    name: 'מ"פ',
    role: "ADMIN",
    companyId: company.id,
  });
  if (process.env.SEED_DEMO === "1") await seedDemo(company.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
