import type { Metadata } from "next";
import Link from "next/link";
import { adminContext } from "@/lib/context";
import { getEquipmentCategories } from "@/lib/queries/equipment";
import { listSets } from "@/lib/queries/sets";
import { BackLink } from "@/components/layout/back-link";
import { Card } from "@/components/ui/card";
import { AddSetForm, SetCard } from "./set-forms";

export const metadata: Metadata = { title: "מארזים" };

/** Admin: equipment sets (מארזים) — what comes together with a main item when it's signed out. */
export default async function SetsPage() {
  await adminContext();
  const [sets, categories] = await Promise.all([listSets(), getEquipmentCategories()]);
  const active = sets.filter((s) => s.isActive);
  const inactive = sets.filter((s) => !s.isActive);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink href="/catalog" label="קטלוג ציוד" />
      <div>
        <h1 className="text-2xl font-bold">מארזים</h1>
        <p className="text-muted-foreground text-sm">
          פריט ראשי והרכיבים שבאים איתו, למשל נגב עם קנס&quot;פ, שח&quot;ע, ציין ומתאם. בהחתמת מארז, הרכיבים נקשרים לפריט
          הראשי ועוברים איתו מעכשיו. רכיב &quot;חובה&quot; שלא נופק מסומן כחסר. &quot;תוספת&quot; מוצעת בהחתמה ואינה נחשבת חוסר.
          לאותו פריט ראשי אפשר להגדיר כמה תצורות.
        </p>
      </div>

      {categories.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">
            אין סוגי צל&quot;ם בקטלוג.{" "}
            <Link href="/catalog" className="text-primary hover:underline">
              הוספת סוגים
            </Link>
          </p>
        </Card>
      ) : (
        <AddSetForm categories={categories} />
      )}

      {active.length === 0 && inactive.length === 0 && (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">עדיין לא הוגדרו מארזים</p>
        </Card>
      )}

      {active.map((s) => (
        <SetCard key={s.id} set={s} categories={categories} />
      ))}

      {inactive.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-2 text-sm font-semibold">מושבתים ({inactive.length})</h2>
          {inactive.map((s) => (
            <SetCard key={s.id} set={s} categories={categories} />
          ))}
        </>
      )}
    </div>
  );
}
