import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPlatoons } from "@/lib/queries/platoons";
import { itemLabel } from "@/lib/equipment-rules";
import { attributeTags, type AttributeSummary } from "@/lib/equipment-attributes";
import { getEquipmentReport, type EquipmentReportType } from "@/lib/queries/equipment";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { Serial } from "@/components/equipment/serial";
import { EquipmentStatusBadge } from "@/components/equipment/status-badge";
import { BackLink } from "@/components/layout/back-link";
import { PlatoonBadge, PlatoonDot } from "@/components/platoon-badge";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: 'דוח צל"ם פלוגתי' };

/** Company equipment report (דוח צל"ם פלוגתי): per-type tables + held-vs-תקן summary. Print / Excel. */
export default async function EquipmentReportPage({ searchParams }: PageProps<"/equipment/report">) {
  await requireUser();
  const raw = (await searchParams).platoon;
  const platoons = await getPlatoons();
  const current = platoons.find((p) => p.id === raw);
  const platoon = current?.id;
  const report = await getEquipmentReport(platoon);
  const types = report.filter((t) => t.equipmentItems.length > 0 || (!platoon && t.targetQuantity));
  const totals = types.reduce(
    (a, t) => ({ held: a.held + t.held, missing: a.missing + t.missing, noSerial: a.noSerial + t.noSerial }),
    { held: 0, missing: 0, noSerial: 0 },
  );
  const exportHref = `/equipment/report/export${platoon ? `?platoon=${platoon}` : ""}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink href="/equipment" label='חזרה לצל"ם' />
        <div className="flex gap-2">
          <Button asChild variant="outline">
            {/* A route handler, not a page — a plain <a> so the browser downloads the file. */}
            <a href={exportHref} download>
              <Download />
              ייצוא לאקסל
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold">דוח צל&quot;ם פלוגתי{current ? ` — ${current.name}` : ""}</h1>
          <p className="text-muted-foreground text-sm">
            {formatNumber(totals.held)} פריטים במצאי
            {totals.missing ? ` · ${formatNumber(totals.missing)} חסרים` : ""}
            {totals.noSerial ? ` · ${formatNumber(totals.noSerial)} ללא צ` : ""}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">הופק {formatDateTime(new Date())}</p>
      </header>

      <nav aria-label="סינון לפי מחלקה" className="no-scrollbar -mx-4 overflow-x-auto px-4 print:hidden">
        <ul className="flex w-max gap-2">
          {[undefined, ...platoons.filter((x) => x.isActive || x.id === platoon)].map((p) => (
            <li key={p?.id ?? "all"}>
              <Link
                href={p ? `/equipment/report?platoon=${p.id}` : "/equipment/report"}
                aria-current={platoon === p?.id ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap",
                  platoon === p?.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
                )}
              >
                {p && <PlatoonDot platoon={p} />}
                {p ? p.name : "כל הפלוגה"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {types.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center">אין פריטים להצגה</p>
      ) : (
        <>
          <SummaryTable types={types} companyWide={!platoon} />
          <AttributesSummary types={types.filter((t) => t.attributeSummary.length > 0 && t.held > 0)} />
          {types
            .filter((t) => t.equipmentItems.length > 0)
            .map((t) => (
              <TypeSection key={t.id} type={t} />
            ))}
        </>
      )}
    </div>
  );
}

function SummaryTable({ types, companyWide }: { types: EquipmentReportType[]; companyWide: boolean }) {
  return (
    <section className="bg-card overflow-x-auto rounded-xl border print:border-0">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="text-muted-foreground border-b text-xs">
          <tr>
            <th className="px-4 py-2.5 text-start font-medium">אמצעי</th>
            <th className="px-3 py-2.5 text-center font-medium">מצאי</th>
            {companyWide && <th className="px-3 py-2.5 text-center font-medium">תקן</th>}
            {companyWide && <th className="px-3 py-2.5 text-center font-medium">פער</th>}
            <th className="px-3 py-2.5 text-center font-medium">חסרים</th>
            <th className="px-3 py-2.5 text-center font-medium">ללא צ</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular-nums">
          {types.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2 font-medium">
                <a href={`#type-${t.id}`} className="hover:underline">
                  {t.name}
                </a>
              </td>
              <td className="px-3 py-2 text-center">{formatNumber(t.held)}</td>
              {companyWide && (
                <td className="text-muted-foreground px-3 py-2 text-center">
                  {t.targetQuantity != null ? formatNumber(t.targetQuantity) : "—"}
                </td>
              )}
              {companyWide && (
                <td className="px-3 py-2 text-center">
                  <Gap gap={t.gap} />
                </td>
              )}
              <td className={cn("px-3 py-2 text-center", t.missing ? "text-danger font-semibold" : "text-muted-foreground")}>
                {t.missing || "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-center",
                  t.noSerial ? "text-warning-foreground dark:text-warning font-semibold" : "text-muted-foreground",
                )}
              >
                {t.noSerial || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** פירוט מאפיינים: per type, how many have each property (קייס, מתאם…), counts summed, choices split. */
function AttributesSummary({ types }: { types: EquipmentReportType[] }) {
  if (types.length === 0) return null;
  return (
    <section className="bg-card rounded-xl border print:break-inside-avoid print:border-0">
      <h2 className="border-b px-4 py-3 font-semibold">
        פירוט מאפיינים <span className="text-muted-foreground text-sm font-normal">· לפי הפריטים במצאי</span>
      </h2>
      <div className="divide-y">
        {types.map((t) => (
          <div key={t.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:gap-4">
            <a href={`#type-${t.id}`} className="w-40 shrink-0 text-sm font-medium hover:underline">
              {t.name} <span className="text-muted-foreground font-normal tabular-nums">({formatNumber(t.held)})</span>
            </a>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {t.attributeSummary.map((s) => (
                <li key={s.key}>
                  <bdi className="font-medium">{s.label}</bdi>: <SummaryValue summary={s} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryValue({ summary: s }: { summary: AttributeSummary }) {
  const parts: ReactNode[] =
    s.kind === "check"
      ? [
          <span key="y" className={s.yes ? "text-success font-semibold" : "text-muted-foreground"}>{formatNumber(s.yes)} יש</span>,
          <span key="n" className={s.no ? "text-danger font-semibold" : "text-muted-foreground"}>{formatNumber(s.no)} אין</span>,
        ]
      : s.kind === "count"
        ? [<span key="t" className="font-semibold">סה&quot;כ {formatNumber(s.total)}</span>]
        : s.options.map((o) => (
            <span key={o.option}>
              {o.option} <span className="font-semibold">{formatNumber(o.n)}</span>
            </span>
          ));
  if (s.unset) parts.push(<span key="u" className="text-muted-foreground">{formatNumber(s.unset)} לא סומן</span>);
  return (
    <span className="tabular-nums">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {p}
        </span>
      ))}
    </span>
  );
}

/** Positive gap = short of תקן (red); negative = above תקן; 0 = exactly on תקן. */
function Gap({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-muted-foreground">—</span>;
  if (gap === 0) return <span className="text-success font-semibold">✓</span>;
  if (gap > 0) return <span className="text-danger font-semibold">חסרים {formatNumber(gap)}</span>;
  return <span className="text-muted-foreground">+{formatNumber(-gap)} מעל התקן</span>;
}

function TypeSection({ type: t }: { type: EquipmentReportType }) {
  const hasAttrs = t.attributeDefs.length > 0;
  return (
    <section id={`type-${t.id}`} className="bg-card scroll-mt-20 rounded-xl border print:break-inside-avoid print:border-0">
      <h2 className="flex flex-wrap items-baseline gap-x-3 border-b px-4 py-3 font-semibold">
        {t.name}
        <span className="text-muted-foreground text-sm font-normal">
          {formatNumber(t.equipmentItems.length)} פריטים
          {t.targetQuantity != null && t.gap !== null ? ` · תקן ${formatNumber(t.targetQuantity)}` : ""}
        </span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-muted-foreground border-b text-xs">
            <tr>
              <th className="w-10 px-4 py-2 text-start font-medium">#</th>
              <th className="px-3 py-2 text-start font-medium">צ / מס&quot;ט</th>
              <th className="px-3 py-2 text-start font-medium">מחלקה</th>
              <th className="px-3 py-2 text-start font-medium">חייל</th>
              <th className="px-3 py-2 text-start font-medium">מ.א</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס</th>
              {hasAttrs && <th className="px-3 py-2 text-start font-medium">מאפיינים</th>}
              <th className="px-3 py-2 text-start font-medium">הערות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {t.equipmentItems.map((i, n) => {
              const notes = [
                i.parent ? `רכיב של ${itemLabel(i.parent)}` : null,
                i.components.length ? `כולל: ${i.components.map(itemLabel).join(", ")}` : null,
                i.notes,
              ].filter(Boolean);
              return (
                <tr key={i.id}>
                  <td className="text-muted-foreground px-4 py-2 tabular-nums">{n + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/equipment/${i.id}`} className="hover:underline">
                      <Serial value={i.serialNumber} />
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <PlatoonBadge platoon={i.platoon} />
                  </td>
                  <td className="px-3 py-2">{i.assignedSoldier?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">
                    <span className="ltr-text tabular-nums">{i.assignedSoldier?.personalNumber ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <EquipmentStatusBadge status={i.status} />
                  </td>
                  {hasAttrs && (
                    <td className="px-3 py-2 text-xs">
                      {attributeTags(t.attributeDefs, i.attributeValues)
                        .map((a) => a.label)
                        .join(" · ") || <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="text-muted-foreground px-3 py-2 text-xs">{notes.join(" · ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
