import type { Metadata } from "next";
import { adminContext } from "@/lib/context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddPlatoonButton, PlatoonCount, PlatoonLine } from "./platoon-forms";

export const metadata: Metadata = { title: "מחלקות" };

/** Admin: how many platoons (מחלקות / צוותים) the company has and what they're called. */
export default async function PlatoonsPage() {
  const { db } = await adminContext();
  const platoons = await db.platoon.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      color: true,
      isActive: true,
      _count: { select: { soldiers: { where: { isActive: true } } } },
    },
  });
  const active = platoons.filter((p) => p.isActive);
  const inactive = platoons.filter((p) => !p.isActive);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">מחלקות</h1>
        <p className="text-muted-foreground text-sm">
          כמה מחלקות (או צוותים) יש בפלוגה ואיך הן נקראות, למשל &quot;צוות 1&quot;, &quot;מפלג&quot;, &quot;חוד&quot;. השמות מופיעים
          בסד&quot;כ, בצל&quot;ם, בערכות ובדוחות, ובייבוא מאקסל מזהים לפיהם את עמודת המחלקה.
        </p>
      </div>

      <Card>
        <CardContent>
          <PlatoonCount current={active.length} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">מחלקות פעילות ({active.length})</CardTitle>
          <CardDescription>לחיצה על השם לשינוי. הסדר כאן הוא הסדר בכל המערכת.</CardDescription>
        </CardHeader>
        <ul className="divide-y">
          {active.map((p, i) => (
            <PlatoonLine key={p.id} platoon={p} soldiers={p._count.soldiers} first={i === 0} last={i === active.length - 1} />
          ))}
        </ul>
        <div className="border-t p-3">
          <AddPlatoonButton />
        </div>
      </Card>

      {inactive.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">מושבתות ({inactive.length})</CardTitle>
            <CardDescription>לא מוצעות בבחירה. נשמרות בגלל היסטוריה (ציוד, יומנים).</CardDescription>
          </CardHeader>
          <ul className="divide-y">
            {inactive.map((p) => (
              <PlatoonLine key={p.id} platoon={p} soldiers={p._count.soldiers} first last />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
