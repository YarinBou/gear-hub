import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NAV_ITEMS } from "@/lib/nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSwitch } from "@/components/theme-switch";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "כל המודולים" };

/** Mobile "עוד" tab — every module in one tappable list. */
export default async function MorePage() {
  const user = await requireUser();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isCompanyAdmin(user.role));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">כל המודולים</h1>
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="hover:bg-accent flex h-14 items-center gap-3 px-4">
                <i.icon className="text-primary size-5" />
                <span className="flex-1 font-medium">{i.label}</span>
                <ChevronLeft className="text-muted-foreground size-4" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="gap-0 py-0">
        <Link href="/account" className="hover:bg-accent flex h-14 items-center gap-3 px-4">
          <UserRound className="text-primary size-5" />
          <span className="flex-1 font-medium">החשבון שלי</span>
          <span className="text-muted-foreground text-sm">{user.name}</span>
          <ChevronLeft className="text-muted-foreground size-4" />
        </Link>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>תצוגה</CardTitle>
          <CardDescription>אוטומטי עוקב אחרי הגדרת המכשיר. הבחירה נשמרת במכשיר הזה.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSwitch />
        </CardContent>
      </Card>
    </div>
  );
}
