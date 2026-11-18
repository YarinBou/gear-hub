import type { Metadata } from "next";
import { adminContext } from "@/lib/context";
import { DEFAULT_KIT_COUNT } from "@/lib/constants";
import { groupLines } from "@/lib/kit";
import { BackLink } from "@/components/layout/back-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddKitItemForm, KitCountSetting, KitDefaultSetting, KitItemLine } from "./kit-item-forms";

export const metadata: Metadata = { title: "תכולת ערכה" };

/** Admin: what a personal kit contains (the checklist on every kit and on the printed form). */
export default async function KitItemsPage() {
  const { user, db } = await adminContext();
  const [items, company] = await Promise.all([
    db.kitItemDef.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, groupName: true, sortOrder: true, targetQuantity: true, systemKey: true, startPresent: true, isActive: true },
    }),
    db.company.findUnique({ where: { id: user.companyId }, select: { kitDefaultPresent: true, kitCount: true } }),
  ]);
  const active = items.filter((i) => i.isActive);
  const inactive = items.filter((i) => !i.isActive);
  const groups = groupLines(active);
  const groupNames = [...new Set(items.map((i) => i.groupName))];
  const order = active.map((i) => i.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink href="/kits" label="ערכות" />
      <div>
        <h1 className="text-2xl font-bold">תכולת ערכה</h1>
        <p className="text-muted-foreground text-sm">
          רשימת הציוד של כל ערכה אישית — בצ&apos;ק ליסט, בטופס ההחתמה ובאחוזי הכשירות. שינויים חלים מיד על ההפעלה הפעילה;
          הפעלות שהסתיימו נשארות כפי שנרשמו.
        </p>
      </div>

      <Card>
        <CardContent>
          <KitCountSetting count={company?.kitCount ?? DEFAULT_KIT_COUNT} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <KitDefaultSetting presentCount={active.filter((i) => i.startPresent).length} total={active.length} />
        </CardContent>
      </Card>

      <AddKitItemForm groups={groupNames} startPresent={company?.kitDefaultPresent ?? false} />

      {groups.map((g) => (
        <Card key={g.groupName} className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">
              {g.groupName} ({g.lines.length})
            </CardTitle>
          </CardHeader>
          <ul className="divide-y">
            {g.lines.map((item) => (
              <KitItemLine
                key={item.id}
                item={item}
                groups={groupNames}
                first={order.indexOf(item.id) === 0}
                last={order.indexOf(item.id) === order.length - 1}
              />
            ))}
          </ul>
        </Card>
      ))}

      {inactive.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">מושבתים ({inactive.length})</CardTitle>
            <CardDescription>לא מופיעים בערכות של ההפעלה הפעילה. הפעלה מחדש מחזירה אותם לכל הערכות.</CardDescription>
          </CardHeader>
          <ul className="divide-y">
            {inactive.map((item) => (
              <KitItemLine key={item.id} item={item} groups={groupNames} first last />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
