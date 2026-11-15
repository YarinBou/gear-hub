import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEquipmentCategories } from "@/lib/queries/equipment";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { getActivePlatoons } from "@/lib/queries/platoons";
import { BackLink } from "@/components/layout/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { NewEquipmentForm } from "./new-equipment-form";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: 'הוספת צל"ם' };

export default async function NewEquipmentPage({ searchParams }: PageProps<"/equipment/new">) {
  const user = await requireUser();
  const [categories, soldiers, sp, platoons] = await Promise.all([
    getEquipmentCategories(),
    getSoldierOptions(),
    searchParams,
    getActivePlatoons(),
  ]);
  const category = typeof sp.category === "string" ? sp.category : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <BackLink href="/equipment" label='חזרה לצל"ם' />
      <h1 className="text-2xl font-bold">הוספת פריטי צל&quot;ם</h1>
      {categories.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין סוגי צל&quot;ם בקטלוג.</p>
          {isCompanyAdmin(user.role) ? (
            <Link href="/catalog" className="text-primary underline-offset-4 hover:underline">
              הוספת סוגים בקטלוג
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm">יש לפנות למ&quot;פ / סמ&quot;פ להוספת סוגים.</p>
          )}
        </Card>
      ) : (
        <Card>
          <CardContent>
            <NewEquipmentForm categories={categories} soldiers={soldiers} defaultCategoryId={category} platoons={platoons} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
