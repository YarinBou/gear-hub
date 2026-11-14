import type { Metadata } from "next";
import Link from "next/link";
import { Backpack, Crosshair, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { EQUIPMENT_STATUS_LABELS, TOTAL_KITS } from "@/lib/constants";
import { Serial } from "@/components/equipment/serial";
import { PlatoonBadge } from "@/components/platoon-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalSearch } from "@/components/layout/global-search";

export const metadata: Metadata = { title: "חיפוש" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  const kitNumber = /^\d{1,2}$/.test(q) ? Number(q) : null;
  const [soldiers, items, kit] = q
    ? await Promise.all([
        prisma.soldier.findMany({
          where: {
            isActive: true,
            OR: [{ name: { contains: q, mode: "insensitive" } }, { personalNumber: { contains: q } }],
          },
          take: 20,
          orderBy: { name: "asc" },
          select: { id: true, name: true, personalNumber: true, platoon: true },
        }),
        prisma.equipmentItem.findMany({
          where: { serialNumber: { contains: q, mode: "insensitive" } },
          take: 20,
          orderBy: { serialNumber: "asc" },
          select: {
            id: true,
            serialNumber: true,
            status: true,
            category: { select: { name: true } },
            assignedSoldier: { select: { name: true } },
          },
        }),
        kitNumber && kitNumber >= 1 && kitNumber <= TOTAL_KITS
          ? prisma.personalKit.findUnique({
              where: { kitNumber },
              select: { kitNumber: true, soldier: { select: { name: true } } },
            })
          : Promise.resolve(null),
      ])
    : [[], [], null];

  const empty = q && soldiers.length === 0 && items.length === 0 && !kit && !kitNumber;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">חיפוש</h1>
      <GlobalSearch defaultValue={q} />

      {!q && <p className="text-muted-foreground text-sm">הקלידו מספר צ / מס&quot;ט, שם לוחם, מספר אישי או מספר ערכה.</p>}
      {empty && <p className="text-muted-foreground text-sm">לא נמצאו תוצאות עבור &quot;{q}&quot;.</p>}

      {kitNumber !== null && kitNumber >= 1 && kitNumber <= TOTAL_KITS && (
        <Card className="gap-2">
          <CardContent>
            <Link href={`/kits/${kitNumber}`} className="flex items-center gap-3">
              <Backpack className="text-primary size-5" />
              <span className="font-medium">ערכה {kitNumber}</span>
              <span className="text-muted-foreground text-sm">{kit?.soldier?.name ?? "לא הונפקה"}</span>
            </Link>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="size-4" /> צל&quot;ם ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.id}>
                  <Link href={`/equipment/${i.id}`} className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-md px-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {i.category.name} · <Serial value={i.serialNumber} />
                      </p>
                      <p className="text-muted-foreground text-xs">{i.assignedSoldier?.name ?? "לא משויך"}</p>
                    </div>
                    <Badge variant={i.status === "MISSING" ? "danger" : "secondary"}>{EQUIPMENT_STATUS_LABELS[i.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {soldiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" /> לוחמים ({soldiers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {soldiers.map((s) => (
                <li key={s.id}>
                  <Link href={`/roster/${s.id}`} className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-md px-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      {s.personalNumber && <p className="text-muted-foreground ltr-text text-xs">{s.personalNumber}</p>}
                    </div>
                    <PlatoonBadge platoon={s.platoon} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
