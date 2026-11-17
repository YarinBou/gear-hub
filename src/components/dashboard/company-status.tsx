import Link from "next/link";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "@/lib/queries/dashboard";

type Row = { href: string; label: string; hint: string; value: string; attention?: boolean };

/** The company in five lines: one tappable row per module, its headline figure at the end. */
export function CompanyStatus({ data }: { data: DashboardData }) {
  const rows: Row[] = [
    { href: "/roster", label: 'סד"כ', hint: "לוחמים", value: formatNumber(data.roster.total) },
    {
      href: "/equipment",
      label: 'צל"ם',
      hint: data.equipment.staleCount ? `${formatNumber(data.equipment.staleCount)} לא אומתו` : "כולם אומתו",
      value: formatNumber(data.equipment.total),
      attention: data.equipment.staleCount > 0,
    },
    {
      href: "/kits",
      label: "ערכות",
      hint: `${formatNumber(data.kits.issued)} מתוך ${formatNumber(data.kits.total)} הונפקו · כשירות`,
      value: `${data.kits.avgReadiness}%`,
      attention: data.kits.issued > 0 && data.kits.avgReadiness < 75,
    },
    {
      href: "/ammo",
      label: "תחמושת",
      hint: data.ammo.low.length ? `${formatNumber(data.ammo.low.length)} מתחת לסף` : "סוגים",
      value: formatNumber(data.ammo.types.length),
      attention: data.ammo.low.length > 0,
    },
    {
      href: "/storage",
      label: 'בימ"ח',
      hint: "מצאי מול תקן",
      value: `${data.storage.fillRate}%`,
      attention: data.storage.shortages.length > 0 || data.storage.expiring.length > 0,
    },
  ];

  return (
    <section aria-labelledby="company-status-title" className="flex flex-col gap-2">
      <h2 id="company-status-title" className="text-lg font-bold">
        מצב הפלוגה
      </h2>
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="hover:bg-accent focus-visible:bg-accent flex min-h-12 items-center gap-2 px-3 py-2 outline-none">
              <span className="flex-1 font-medium">{r.label}</span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
                {r.attention && <AlertTriangle className="text-warning-foreground dark:text-warning size-3.5 shrink-0" aria-label="לטיפול" />}
                <span className="truncate">{r.hint}</span>
              </span>
              <span className="text-lg font-extrabold tabular-nums">{r.value}</span>
              <ChevronLeft className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
