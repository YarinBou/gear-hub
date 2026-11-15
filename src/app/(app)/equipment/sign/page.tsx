import type { Metadata } from "next";
import Link from "next/link";
import { companyContext } from "@/lib/context";
import { getSetSignData } from "@/lib/queries/sets";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { isCompanyAdmin } from "@/lib/roles";
import { NoDeploymentCard, ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { BackLink } from "@/components/layout/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { SignSetForm } from "./sign-set-form";

export const metadata: Metadata = { title: "החתמת מארז" };

export default async function SignSetPage() {
  const { user, deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="החתמות" />;
  const [{ sets, items }, soldiers] = await Promise.all([getSetSignData(), getSoldierOptions()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <BackLink href="/equipment" label='חזרה לצל"ם' />
      <div>
        <h1 className="text-2xl font-bold">החתמת מארז</h1>
        <p className="text-muted-foreground text-sm">
          בוחרים לוחם ומארז, ומשבצים פריט לכל רכיב. כל הסט נקשר לפריט הראשי ועובר איתו מעכשיו (החזרה, העברה, סטטוס).
        </p>
      </div>
      {sets.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">עדיין לא הוגדרו מארזים.</p>
          {isCompanyAdmin(user.role) ? (
            <Link href="/catalog/sets" className="text-primary text-sm font-medium hover:underline">
              הגדרת מארזים
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm">יש לפנות למ&quot;פ / סמ&quot;פ להגדרת מארזים.</p>
          )}
        </Card>
      ) : (
        <Card>
          <CardContent>
            <ReadOnlyWhenClosed>
              <SignSetForm sets={sets} items={items} soldiers={soldiers} />
            </ReadOnlyWhenClosed>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
