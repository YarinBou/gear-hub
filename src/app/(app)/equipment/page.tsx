import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, FileText, Plus, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, VERIFICATION_STALE_DAYS } from "@/lib/constants";
import { getPlatoons } from "@/lib/queries/platoons";
import { getEquipmentCategories, getEquipmentCounts, listEquipment, type EquipmentFilters } from "@/lib/queries/equipment";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { EquipmentList } from "./equipment-list";
import { ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: 'ניהול צל"ם' };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EquipmentPage({ searchParams }: PageProps<"/equipment">) {
  await requireUser();
  const sp = await searchParams;
  const statusRaw = first(sp.status);
  const platoonRaw = first(sp.platoon);
  const platoons = await getPlatoons();
  const filters: EquipmentFilters = {
    q: first(sp.q)?.trim() || undefined,
    status: (EQUIPMENT_STATUSES as string[]).includes(statusRaw ?? "") ? (statusRaw as EquipmentStatus) : undefined,
    categoryId: first(sp.category) || undefined,
    platoonId:
      platoonRaw === "NONE" ? "NONE" : platoons.some((p) => p.id === platoonRaw) ? platoonRaw : undefined,
    stale: first(sp.filter) === "stale",
    noSerial: first(sp.filter) === "noserial",
    setMissing: first(sp.filter) === "setmissing",
    page: Number(first(sp.page)) || 1,
  };

  const [{ items, total, page, pageCount }, counts, categories] = await Promise.all([
    listEquipment(filters),
    getEquipmentCounts(),
    getEquipmentCategories(),
  ]);

  /** Status / stale chips keep the other filters. */
  const chipHref = (next: { status?: EquipmentStatus; stale?: boolean; noSerial?: boolean; setMissing?: boolean }) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.categoryId) p.set("category", filters.categoryId);
    if (filters.platoonId) p.set("platoon", filters.platoonId);
    if (next.status) p.set("status", next.status);
    if (next.stale) p.set("filter", "stale");
    if (next.noSerial) p.set("filter", "noserial");
    if (next.setMissing) p.set("filter", "setmissing");
    const s = p.toString();
    return s ? `/equipment?${s}` : "/equipment";
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    return `/equipment?${p.toString()}`;
  };

  const noFilterChip = !filters.status && !filters.stale && !filters.noSerial && !filters.setMissing;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ניהול צל&quot;ם</h1>
          <p className="text-muted-foreground text-sm">{formatNumber(counts.total)} פריטים ממוספרים</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/equipment/report">
              <FileText />
              דוח פלוגתי
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/equipment/sign">
              <Boxes />
              החתמת מארז
            </Link>
          </Button>
          <Button asChild>
            <Link href="/equipment/new">
              <Plus />
              הוספת פריטים
            </Link>
          </Button>
        </div>
      </div>

      <nav aria-label="סינון לפי סטטוס" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          <Chip href={chipHref({})} active={noFilterChip} label="הכל" count={counts.total} />
          <Chip
            href={chipHref({ stale: true })}
            active={!!filters.stale}
            label={`לא אומתו ${VERIFICATION_STALE_DAYS}+ ימים`}
            count={counts.stale}
            tone={counts.stale ? "warning" : undefined}
            icon
          />
          {counts.noSerial > 0 && (
            <Chip
              href={chipHref({ noSerial: true })}
              active={!!filters.noSerial}
              label="ללא צ"
              count={counts.noSerial}
              tone="warning"
            />
          )}
          {(counts.setMissing > 0 || filters.setMissing) && (
            <Chip
              href={chipHref({ setMissing: true })}
              active={!!filters.setMissing}
              label="מארז חסר"
              count={counts.setMissing}
              tone="warning"
            />
          )}
          {EQUIPMENT_STATUSES.map((s) => (
            <Chip
              key={s}
              href={chipHref({ status: s })}
              active={filters.status === s}
              label={EQUIPMENT_STATUS_LABELS[s]}
              count={counts.status[s]}
              tone={s === "MISSING" && counts.status[s] ? "danger" : undefined}
            />
          ))}
        </ul>
      </nav>

      <FilterBar categories={categories} platoons={platoons} />

      {items.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <p className="text-muted-foreground">
            {counts.total === 0 ? 'אין עדיין פריטי צל"ם במערכת' : "לא נמצאו פריטים התואמים לסינון"}
          </p>
          {counts.total === 0 && (
            <Button asChild variant="outline">
              <Link href="/equipment/new">הוספת פריטים</Link>
            </Button>
          )}
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {total > items.length
              ? `מציג ${formatNumber((page - 1) * 100 + 1)}–${formatNumber((page - 1) * 100 + items.length)} מתוך ${formatNumber(total)}`
              : `${formatNumber(total)} פריטים`}
          </p>
          <ReadOnlyWhenClosed orNone>
            <EquipmentList items={items} platoons={platoons.filter((p) => p.isActive)} />
          </ReadOnlyWhenClosed>
          {pageCount > 1 && (
            <nav aria-label="עימוד" className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>הקודם</Link>
                </Button>
              )}
              <span className="text-muted-foreground text-sm">
                עמוד {page} מתוך {pageCount}
              </span>
              {page < pageCount && (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>הבא</Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  label,
  count,
  tone,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone?: "warning" | "danger";
  icon?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
          !active && tone === "warning" && "border-warning/60",
          !active && tone === "danger" && "border-danger/50 text-danger",
        )}
      >
        {icon && <ShieldAlert className="size-4" />}
        {label}
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
      </Link>
    </li>
  );
}
