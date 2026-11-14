import Link from "next/link";
import { AlertTriangle, CalendarClock, PackageX, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AMMO_CATEGORY_LABELS, VERIFICATION_STALE_DAYS } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";
import type { DashboardData } from "@/lib/queries/dashboard";

type Alert = {
  key: string;
  icon: typeof AlertTriangle;
  tone: "warning" | "danger";
  title: string;
  detail: string;
  href: string;
};

export function AlertsPanel({ data }: { data: DashboardData }) {
  const alerts: Alert[] = [];

  for (const a of data.ammo.low) {
    alerts.push({
      key: `ammo-${a.id}`,
      icon: PackageX,
      tone: a.quantity === 0 ? "danger" : "warning",
      title: `מלאי נמוך: ${a.name}`,
      detail: `${formatNumber(a.quantity)} במלאי · סף מינימום ${formatNumber(a.minThreshold ?? 0)}${
        a.ammoCategory ? ` · ${AMMO_CATEGORY_LABELS[a.ammoCategory]}` : ""
      }`,
      href: "/ammo?filter=low",
    });
  }

  if (data.equipment.staleCount > 0) {
    alerts.push({
      key: "stale",
      icon: ShieldAlert,
      tone: "warning",
      title: `${formatNumber(data.equipment.staleCount)} פריטי צל"ם לא אומתו מעל ${VERIFICATION_STALE_DAYS} ימים`,
      detail: data.equipment.staleItems
        .slice(0, 3)
        .map((i) => `${i.category.name} ${i.serialNumber}`)
        .join(" · "),
      href: "/equipment?filter=stale",
    });
  }

  const missing = data.equipment.byStatus.MISSING ?? 0;
  if (missing > 0) {
    alerts.push({
      key: "missing",
      icon: AlertTriangle,
      tone: "danger",
      title: `${formatNumber(missing)} פריטי צל"ם מסומנים כחסרים`,
      detail: "נדרש בירור ודיווח",
      href: "/equipment?status=MISSING",
    });
  }

  for (const s of data.storage.expiring) {
    alerts.push({
      key: `exp-${s.id}`,
      icon: CalendarClock,
      tone: s.expired ? "danger" : "warning",
      title: `${s.expired ? "פג תוקף" : "תוקף מתקרב"}: ${s.category.name}`,
      detail: `תאריך תפוגה ${formatDate(s.expiryDate)}`,
      href: "/storage",
    });
  }

  for (const s of data.storage.shortages.slice(0, 5)) {
    alerts.push({
      key: `short-${s.id}`,
      icon: PackageX,
      tone: "warning",
      title: `חוסר בבימ"ח: ${s.category.name}`,
      detail: `מצאי ${formatNumber(s.currentQuantity)} מתוך תקן ${formatNumber(s.targetQuantity)}`,
      href: "/storage",
    });
  }

  // Danger first, stable otherwise.
  alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          התראות
          {alerts.length > 0 && <Badge variant="danger">{alerts.length}</Badge>}
        </CardTitle>
        <CardDescription>פריטים הדורשים טיפול</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">אין התראות פתוחות</p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="hover:bg-accent -mx-2 flex items-start gap-3 rounded-md px-2 py-3">
                  <a.icon
                    className={
                      a.tone === "danger"
                        ? "text-danger mt-0.5 size-5 shrink-0"
                        : "text-warning-foreground dark:text-warning mt-0.5 size-5 shrink-0"
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.detail && <p className="text-muted-foreground truncate text-xs">{a.detail}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
