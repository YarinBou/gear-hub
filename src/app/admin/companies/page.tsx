import { Suspense } from "react";
import type { Metadata } from "next";
import { LogOut, ShieldHalf } from "lucide-react";
import { logout } from "@/app/login/actions";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddCompanyForm, CompanyRow } from "./company-forms";

export const metadata: Metadata = { title: "ניהול פלוגות" };

// Super-admin home: every company in the system. Lives outside the (app) shell, which needs a
// company to work in. Reads across companies, so it uses the unscoped client on purpose.

async function Companies() {
  const me = await requireSuperAdmin();
  const companies = await prisma.company.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { users: true, soldiers: true, equipmentItems: true } },
    },
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ניהול פלוגות</h1>
          <p className="text-muted-foreground text-sm">
            {me.name} · {companies.filter((c) => c.isActive).length} פלוגות פעילות
          </p>
        </div>
        <form action={logout}>
          <Button variant="ghost" size="icon" type="submit" aria-label="התנתקות" title="התנתקות">
            <LogOut className="size-5 rtl:-scale-x-100" />
          </Button>
        </form>
      </div>

      <AddCompanyForm />

      <Card className="gap-0 py-0">
        {companies.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">עדיין אין פלוגות במערכת.</p>
        ) : (
          <ul className="divide-y">
            {companies.map((c) => (
              <CompanyRow
                key={c.id}
                company={{
                  id: c.id,
                  name: c.name,
                  isActive: c.isActive,
                  users: c._count.users,
                  soldiers: c._count.soldiers,
                  items: c._count.equipmentItems,
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function CompaniesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-2 text-lg font-bold">
        <ShieldHalf className="text-primary size-7" />
        Gear-Hub
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">טוען…</p>}>
        <Companies />
      </Suspense>
    </main>
  );
}
