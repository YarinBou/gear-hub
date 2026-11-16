import "server-only";
import { scopedDb } from "@/lib/db";
import { createKitStatuses } from "@/lib/kit-service";

// Copy one company's setup into another as a starting point (super-admin only): the catalog
// (equipment / ammo / storage types, with תקן and thresholds), the sets (מארזים) and the
// personal-kit checklist. Templates only — never items, serial numbers (צ), soldiers, stock,
// assignments or anything else belonging to the source company.
//
// Merge semantics: only what the target is missing is added, matched by name; anything the
// target already has is left exactly as it is. Safe to run more than once.

export type CopySetupResult = { categories: number; sets: number; kitItems: number };

const key = (domain: string, name: string) => `${domain}\u0000${name}`;

export async function copyCompanySetup(sourceId: string, targetId: string): Promise<CopySetupResult> {
  if (sourceId === targetId) throw new Error("copyCompanySetup: source and target are the same company");
  const src = scopedDb(sourceId);
  const [categories, storageTargets, sets, kitItems] = await Promise.all([
    src.equipmentCategory.findMany({
      where: { isActive: true },
      select: {
        name: true,
        domain: true,
        description: true,
        ammoCategory: true,
        minThreshold: true,
        targetQuantity: true,
        requiresExpiry: true,
      },
    }),
    // A storage type's תקן lives on its storage line.
    src.storageItem.findMany({
      where: { category: { isActive: true } },
      orderBy: { createdAt: "asc" },
      select: { targetQuantity: true, category: { select: { name: true } } },
    }),
    src.equipmentSet.findMany({
      where: { isActive: true },
      select: {
        name: true,
        notes: true,
        mainCategory: { select: { domain: true, name: true } },
        slots: {
          orderBy: { sortOrder: "asc" },
          select: { quantity: true, required: true, sortOrder: true, category: { select: { domain: true, name: true } } },
        },
      },
    }),
    src.kitItemDef.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { label: true, groupName: true, sortOrder: true, targetQuantity: true, systemKey: true },
    }),
  ]);

  const db = scopedDb(targetId);
  return db.$transaction(
    async (tx) => {
      // ── Catalog ──
      const existing = await tx.equipmentCategory.findMany({ select: { domain: true, name: true } });
      const have = new Set(existing.map((c) => key(c.domain, c.name)));
      const newCategories = categories.filter((c) => !have.has(key(c.domain, c.name)));
      const created = await tx.equipmentCategory.createManyAndReturn({
        data: newCategories.map((c) => ({ ...c, companyId: targetId })),
        skipDuplicates: true,
        select: { id: true, domain: true, name: true },
      });

      // One storage line (תקן / מצאי 0) per new storage type, with the source's תקן.
      const storageTarget = new Map<string, number>();
      for (const s of storageTargets) if (!storageTarget.has(s.category.name)) storageTarget.set(s.category.name, s.targetQuantity);
      const newStorage = created.filter((c) => c.domain === "STORAGE");
      if (newStorage.length) {
        await tx.storageItem.createMany({
          data: newStorage.map((c) => ({ companyId: targetId, categoryId: c.id, targetQuantity: storageTarget.get(c.name) ?? 0 })),
        });
      }

      // ── Sets (מארזים) ── matched to the target's types by (domain, name).
      const allTypes = await tx.equipmentCategory.findMany({ select: { id: true, domain: true, name: true } });
      const typeId = new Map(allTypes.map((c) => [key(c.domain, c.name), c.id]));
      const haveSets = new Set((await tx.equipmentSet.findMany({ select: { name: true } })).map((s) => s.name));
      let setCount = 0;
      for (const s of sets) {
        if (haveSets.has(s.name)) continue;
        const mainCategoryId = typeId.get(key(s.mainCategory.domain, s.mainCategory.name));
        if (!mainCategoryId) continue; // main type exists in the target but is unknown here — skip
        await tx.equipmentSet.create({
          data: {
            companyId: targetId,
            name: s.name,
            notes: s.notes,
            mainCategoryId,
            slots: {
              create: s.slots.flatMap((slot) => {
                const categoryId = typeId.get(key(slot.category.domain, slot.category.name));
                return categoryId
                  ? [{ companyId: targetId, categoryId, quantity: slot.quantity, required: slot.required, sortOrder: slot.sortOrder }]
                  : [];
              }),
            },
          },
        });
        setCount++;
      }

      // ── Personal-kit checklist ── matched by (section, label); system lines by their key.
      const haveDefs = await tx.kitItemDef.findMany({ select: { label: true, groupName: true, systemKey: true, sortOrder: true } });
      const haveLines = new Set(haveDefs.map((d) => key(d.groupName, d.label)));
      const haveKeys = new Set(haveDefs.flatMap((d) => (d.systemKey ? [d.systemKey] : [])));
      const newDefs = kitItems.filter((d) => !haveLines.has(key(d.groupName, d.label)) && !(d.systemKey && haveKeys.has(d.systemKey)));
      if (newDefs.length) {
        // Added after the target's own lines, in the source's order.
        const base = Math.max(0, ...haveDefs.map((d) => d.sortOrder));
        await tx.kitItemDef.createMany({
          data: newDefs.map((d, i) => ({ ...d, companyId: targetId, sortOrder: base + (i + 1) * 10 })),
        });
        // Kits of a running deployment get rows for the new lines.
        const kits = await tx.personalKit.findMany({ where: { deployment: { status: "ACTIVE" } }, select: { id: true } });
        await createKitStatuses(tx, { companyId: targetId, kitIds: kits.map((k) => k.id) });
      }

      return { categories: created.length, sets: setCount, kitItems: newDefs.length };
    },
    { timeout: 30_000 },
  );
}
