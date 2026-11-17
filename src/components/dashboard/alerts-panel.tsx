import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import { AMMO_CATEGORY_LABELS, VERIFICATION_STALE_DAYS } from "@/lib/constants";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { itemLabel } from "@/lib/equipment-rules";
import type { DashboardData } from "@/lib/queries/dashboard";

type Alert = {
  key: string;
  tone: "warning" | "danger";
  title: string;
  detail: string;
  href: string;
};

/** "a, b, c ועוד 4" — keeps a one-line detail readable when a group is long. */
function listOf(names: string[], max = 3) {
  const shown = names.slice(0, max).join(" · ");
  return names.length > max ? `${shown} · ועוד ${names.length - max}` : shown;
}

/**
 * What needs attention right now, one row per kind of problem (several low ammo types are one row,
 * linking to the same filtered list as before). Danger rows first. Each row says what is wrong in
 * words and an icon whose shape differs by severity, so status never depends on color alone.
 */
export function AlertsPanel({ data }: { data: DashboardData }) {
  const alerts: Alert[] = [];

  const low = data.ammo.low;
  if (low.length === 1) {
    const a = low[0];
    alerts.push({
      key: "ammo",
      tone: a.quantity === 0 ? "danger" : "warning",
      title: `מלאי נמוך: ${a.name}`,
      detail: `${formatNumber(a.quantity)} במלאי · סף מינימום ${formatNumber(a.minThreshold ?? 0)}${
        a.ammoCategory ? ` · ${AMMO_CATEGORY_LABELS[a.ammoCategory]}` : ""
      }`,
      href: "/ammo?filter=low",
    });
  } else if (low.length > 1) {
    alerts.push({
      key: "ammo",
      tone: low.some((a) => a.quantity === 0) ? "danger" : "warning",
      title: `${formatNumber(low.length)} סוגי תחמושת מתחת לסף`,
      detail: listOf(low.map((a) => a.name)),
      href: "/ammo?filter=low",
    });
  }

  const missing = data.equipment.byStatus.MISSING ?? 0;
  if (missing > 0) {
    alerts.push({
      key: "missing",
      tone: "danger",
      title: `${formatNumber(missing)} פריטי צל"ם מסומנים כחסרים`,
      detail: "נדרש בירור ודיווח",
      href: "/equipment?status=MISSING",
    });
  }

  if (data.equipment.staleCount > 0) {
    alerts.push({
      key: "stale",
      tone: "warning",
      title: `${formatNumber(data.equipment.staleCount)} פריטי צל"ם לא אומתו מעל ${VERIFICATION_STALE_DAYS} ימים`,
      detail: listOf(data.equipment.staleItems.map((i) => itemLabel(i)), 2),
      href: "/equipment?filter=stale",
    });
  }

  const expired = data.storage.expiring.filter((s) => s.expired);
  const expiringSoon = data.storage.expiring.filter((s) => !s.expired);
  if (expired.length) {
    alerts.push({
      key: "expired",
      tone: "danger",
      title: expired.length === 1 ? `פג תוקף: ${expired[0].category.name}` : `${formatNumber(expired.length)} פריטים בבימ"ח פג תוקפם`,
      detail: expired.length === 1 ? `בימ"ח · פג ב-${formatDate(expired[0].expiryDate)}` : listOf(expired.map((s) => s.category.name)),
      href: "/storage?filter=expiry",
    });
  }
  if (expiringSoon.length) {
    alerts.push({
      key: "expiring",
      tone: "warning",
      title:
        expiringSoon.length === 1 ? `תוקף מתקרב: ${expiringSoon[0].category.name}` : `${formatNumber(expiringSoon.length)} פריטים בבימ"ח שתוקפם מתקרב`,
      detail:
        expiringSoon.length === 1 ? `תאריך תפוגה ${formatDate(expiringSoon[0].expiryDate)}` : listOf(expiringSoon.map((s) => s.category.name)),
      href: "/storage?filter=expiry",
    });
  }

  const shortages = data.storage.shortages;
  if (shortages.length) {
    alerts.push({
      key: "shortage",
      tone: "warning",
      title: shortages.length === 1 ? `חוסר בבימ"ח: ${shortages[0].category.name}` : `${formatNumber(shortages.length)} חוסרים בבימ"ח`,
      detail:
        shortages.length === 1
          ? `מצאי ${formatNumber(shortages[0].currentQuantity)} מתוך תקן ${formatNumber(shortages[0].targetQuantity)}`
          : listOf(shortages.map((s) => s.category.name)),
      href: "/storage?filter=shortage",
    });
  }

  // Danger first, stable otherwise.
  alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <h1 id="attention-title" className="text-2xl font-extrabold text-balance">
          {alerts.length ? "דורש טיפול" : "אין דבר שדורש טיפול"}
        </h1>
        {alerts.length > 0 && (
          <span className="bg-danger text-danger-foreground inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="bg-card text-muted-foreground flex items-center gap-3 rounded-xl border px-4 py-5 text-sm">
          <CheckCircle2 className="text-success size-6 shrink-0" aria-hidden />
          אין תחמושת מתחת לסף, חוסרים בבימ&quot;ח או צל&quot;ם שלא אומת.
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-xl border">
          {alerts.map((a) => {
            const Icon = a.tone === "danger" ? XCircle : AlertTriangle;
            return (
              <li key={a.key}>
                <Link href={a.href} className="hover:bg-accent focus-visible:bg-accent flex min-h-17 items-center gap-3 px-3 py-2.5 outline-none">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      a.tone === "danger" ? "bg-danger/15 text-danger" : "bg-warning/20 text-warning-foreground dark:text-warning",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="sr-only">{a.tone === "danger" ? "דחוף:" : "לטיפול:"}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="leading-snug font-bold">{a.title}</span>
                    {a.detail && (
                      <span dir="rtl" className="text-muted-foreground truncate text-sm">
                        {a.detail}
                      </span>
                    )}
                  </span>
                  <ChevronLeft className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
