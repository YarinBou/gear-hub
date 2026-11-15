import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActivePlatoons } from "@/lib/queries/platoons";
import { BackLink } from "@/components/layout/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { createSoldier } from "../actions";
import { SoldierForm } from "../soldier-form";

export const metadata: Metadata = { title: "הוספת לוחם" };

export default async function NewSoldierPage({ searchParams }: PageProps<"/roster/new">) {
  await requireUser();
  const p = (await searchParams).platoon;
  const platoons = await getActivePlatoons();
  const platoon = typeof p === "string" && platoons.some((x) => x.id === p) ? p : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <BackLink href="/roster" label='חזרה לסד"כ' />
      <h1 className="text-2xl font-bold">הוספת לוחם</h1>
      <Card>
        <CardContent>
          <SoldierForm mode="create" action={createSoldier} initial={{ platoon }} platoons={platoons} />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-sm">
        מוסיפים רשימה שלמה?{" "}
        <Link href="/roster/import" className="text-primary underline-offset-4 hover:underline">
          ייבוא מרוכז מאקסל
        </Link>
      </p>
    </div>
  );
}
