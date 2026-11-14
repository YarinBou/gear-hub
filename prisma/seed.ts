import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { AmmoCategory, Platoon } from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }),
});

const TOTAL_KITS = 98;

const EQUIPMENT_TYPES = [
  "M16",
  "M4",
  "מאג",
  "נגב",
  "מטול רימונים",
  "כוונת M5",
  "כוונת טריג'יקון",
  "משקפת",
  "אמר\"ל (ראיית לילה)",
  "רחפן",
  "מכשיר קשר",
];

const AMMO_TYPES: { name: string; ammoCategory: AmmoCategory; minThreshold: number }[] = [
  { name: "5.56 מ\"מ רגיל", ammoCategory: "STANDARD", minThreshold: 10000 },
  { name: "5.56 מ\"מ נותב", ammoCategory: "STANDARD", minThreshold: 2000 },
  { name: "7.62 מ\"מ שרשרת", ammoCategory: "STANDARD", minThreshold: 3000 },
  { name: "רימון רסס", ammoCategory: "EXPLOSIVE", minThreshold: 50 },
  { name: "רימון 40 מ\"מ", ammoCategory: "EXPLOSIVE", minThreshold: 60 },
  { name: "רימון הלם", ammoCategory: "NON_LETHAL", minThreshold: 30 },
  { name: "רימון גז", ammoCategory: "NON_LETHAL", minThreshold: 30 },
];

const STORAGE_TYPES: { name: string; requiresExpiry?: boolean; target: number }[] = [
  { name: "רשת הסוואה", target: 12 },
  { name: "חסם עורקים", requiresExpiry: true, target: 120 },
  { name: "ערכת עזרה ראשונה", requiresExpiry: true, target: 20 },
  { name: "מנשא מים (קמל)", target: 100 },
  { name: "ציוד גשם", target: 100 },
  { name: "כיסוי קסדה", target: 100 },
];

async function seedAdmin() {
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`• admin user "${username}" already exists — skipped`);
    return;
  }
  const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString("base64url");
  await prisma.user.create({
    data: { username, name: "מנהל מערכת", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`• created admin "${username}"`);
  if (!process.env.SEED_ADMIN_PASSWORD) console.log(`  generated password: ${password}  (change it after first login)`);
}

async function seedCatalog() {
  for (const name of EQUIPMENT_TYPES) {
    await prisma.equipmentCategory.upsert({
      where: { domain_name: { domain: "EQUIPMENT", name } },
      update: {},
      create: { domain: "EQUIPMENT", name },
    });
  }
  for (const a of AMMO_TYPES) {
    await prisma.equipmentCategory.upsert({
      where: { domain_name: { domain: "AMMUNITION", name: a.name } },
      update: {},
      create: { domain: "AMMUNITION", ...a },
    });
  }
  for (const s of STORAGE_TYPES) {
    const cat = await prisma.equipmentCategory.upsert({
      where: { domain_name: { domain: "STORAGE", name: s.name } },
      update: {},
      create: { domain: "STORAGE", name: s.name, requiresExpiry: s.requiresExpiry ?? false },
    });
    const exists = await prisma.storageItem.findFirst({ where: { categoryId: cat.id } });
    if (!exists) {
      await prisma.storageItem.create({ data: { categoryId: cat.id, targetQuantity: s.target, currentQuantity: 0 } });
    }
  }
  console.log("• catalog seeded");
}

async function seedKits() {
  const { count } = await prisma.personalKit.createMany({
    data: Array.from({ length: TOTAL_KITS }, (_, i) => ({ kitNumber: i + 1 })),
    skipDuplicates: true,
  });
  console.log(`• ${count} personal kits created (1–${TOTAL_KITS})`);
}

/** Optional demo data for local development (SEED_DEMO=1). */
async function seedDemo() {
  if (await prisma.soldier.count()) {
    console.log("• soldiers exist — demo data skipped");
    return;
  }
  const platoons: Platoon[] = ["PLATOON_1", "PLATOON_2", "PLATOON_3", "HQ"];
  const firstNames = ["יוסי", "דניאל", "איתי", "נועם", "עומר", "אביב", "רועי", "אורי", "תומר", "עידו"];
  const lastNames = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "דהן", "אזולאי", "שפירא"];

  const m16 = await prisma.equipmentCategory.findFirstOrThrow({ where: { domain: "EQUIPMENT", name: "M16" } });
  const kitKeys = [
    "weaponIssued", "cleaningKit", "weaponSling", "weaponOil", "uniform1", "uniform2", "workBelt",
    "sleepingBag", "tacticalEyewear", "kneePads", "gearBag90L", "tacticalVest", "ceramicPlates",
    "helmet", "catTourniquet", "headlamp",
  ] as const;

  for (let i = 0; i < 40; i++) {
    const platoon = platoons[i % 4];
    const soldier = await prisma.soldier.create({
      data: {
        name: `${firstNames[i % 10]} ${lastNames[(i * 3) % 10]}`,
        personalNumber: String(8_000_000 + i * 137),
        platoon,
      },
    });
    const weapon = await prisma.equipmentItem.create({
      data: {
        serialNumber: `M16-${100200 + i}`,
        categoryId: m16.id,
        status: "WITH_SOLDIER",
        assignedSoldierId: soldier.id,
        platoon,
        lastVerifiedAt: new Date(Date.now() - (i % 12) * 86_400_000),
      },
    });
    const flags = Object.fromEntries(kitKeys.map((k, j) => [k, (i + j) % 9 !== 0]));
    await prisma.personalKit.update({
      where: { kitNumber: i + 1 },
      data: { soldierId: soldier.id, personalWeaponId: weapon.id, rifleType: "M16", magazineCount: 7, ammoCount: 210, ...flags },
    });
  }

  const ammo = await prisma.equipmentCategory.findMany({ where: { domain: "AMMUNITION" } });
  for (const [i, a] of ammo.entries()) {
    await prisma.ammoStock.create({
      data: {
        categoryId: a.id,
        location: "בונקר פלוגתי",
        quantity: Math.round((a.minThreshold ?? 100) * (i % 3 === 0 ? 0.6 : 1.4)),
        lastCountedAt: new Date(),
      },
    });
  }

  const storage = await prisma.storageItem.findMany({ include: { category: true } });
  for (const [i, s] of storage.entries()) {
    await prisma.storageItem.update({
      where: { id: s.id },
      data: {
        currentQuantity: Math.round(s.targetQuantity * (i % 2 ? 1 : 0.8)),
        expiryDate: s.category.requiresExpiry ? new Date(Date.now() + (i * 20 - 10) * 86_400_000) : null,
      },
    });
  }
  console.log("• demo data seeded (40 soldiers, M16s, kits, ammo, storage)");
}

async function main() {
  await seedAdmin();
  await seedCatalog();
  await seedKits();
  if (process.env.SEED_DEMO === "1") await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
