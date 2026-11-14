import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AMMO_LEVEL_LABELS, isLowStock, type AmmoLevel } from "@/lib/ammo-rules";
import { AMMO_CATEGORY_LABELS } from "@/lib/constants";
import { getActiveCategories } from "@/lib/queries/catalog";
import { getAmmoLocations, getAmmoOverview, type AmmoTypeOverview } from "@/lib/queries/ammo";
import { cn, formatDaysAgo, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AmmoCategory } from "@/generated/prisma/enums";
import { AddStockForm, StockRow } from "./ammo-forms";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "ניהול תחמושת" };

const CATEGORY_ORDER: AmmoCategory[] = ["STANDARD", "EXPLOSIVE", "NON_LETHAL"];

const LEVEL_BADGE: Record<AmmoLevel, "success" | "warning" | "danger" | "outline"> = {
  OK: "success",
  LOW: "warning",
  EMPTY: "danger",
  NO_THRESHOLD: "outline",
};
const LEVEL_BAR: Record<AmmoLevel, string> = {
  OK: "bg-success",
  LOW: "bg-warning",
  EMPTY: "bg-danger",
  NO_THRESHOLD: "bg-primary",
};
const CATEGORY_BADGE: Record<AmmoCategory, "danger" | "warning" | "secondary"> = {
  EXPLOSIVE: "danger",
  NON_LETHAL: "warning",
  STANDARD: "secondary",
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AmmoPage({ searchParams }: PageProps<"/ammo">) {
  const user = await requireUser();
  const sp = await searchParams;
  const catRaw = first(sp.cat);
  const cat = CATEGORY_ORDER.includes(catRaw as AmmoCategory) ? (catRaw as AmmoCategory) : undefined;
  const lowOnly = first(sp.filter) === "low";
  const addFor = first(sp.add);

  const [overview, categories, locations] = await Promise.all([
    getAmmoOverview(),
    getActiveCategories("AMMUNITION"),
    getAmmoLocations(),
  ]);

  const low = overview.filter((t) => isLowStock(t.total, t.minThreshold));
  const shown = overview
    .filter((t) => !cat || t.ammoCategory === cat)
    .filter((t) => !lowOnly || isLowStock(t.total, t.minThreshold));
  // Group by ammo category, in a fixed order.
  const groups = CATEGORY_ORDER.map((c) => ({ category: c, types: shown.filter((t) => t.ammoCategory === c) })).filter(
    (g) => g.types.length,
  );
  const uncategorized = shown.filter((t) => !t.ammoCategory);

  const chip = (label: string, href: string, active: boolean, count: number, tone?: "warning") => (
    <li key={label}>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
          !active && tone === "warning" && "border-warning/60",
        )}
      >
        {tone === "warning" && <AlertTriangle className="size-4" />}
        {label}
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ניהול תחמושת</h1>
        <p className="text-muted-foreground text-sm">
          {overview.length} סוגים · {low.length ? `${low.length} מתחת לסף המינימום` : "כל הסוגים מעל הסף"}
        </p>
      </div>

      <nav aria-label="סינון" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {chip("הכל", "/ammo", !cat && !lowOnly, overview.length)}
          {chip("מתחת לסף", "/ammo?filter=low", lowOnly, low.length, low.length ? "warning" : undefined)}
          {CATEGORY_ORDER.map((c) =>
            chip(AMMO_CATEGORY_LABELS[c], `/ammo?cat=${c}`, cat === c, overview.filter((t) => t.ammoCategory === c).length),
          )}
        </ul>
      </nav>

      {categories.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין סוגי תחמושת בקטלוג.</p>
          {isCompanyAdmin(user.role) && (
            <Link href="/catalog?domain=AMMUNITION" className="text-primary underline-offset-4 hover:underline">
              הוספת סוגים בקטלוג
            </Link>
          )}
        </Card>
      ) : (
        <AddStockForm key={addFor ?? "add"} categories={categories} locations={locations} defaultCategoryId={addFor} />
      )}

      {[...groups, ...(uncategorized.length ? [{ category: null, types: uncategorized }] : [])].map((g) => (
        <section key={g.category ?? "none"} className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-semibold">
            {g.category ? `תחמושת ${AMMO_CATEGORY_LABELS[g.category]}` : "ללא קטגוריה"}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.types.map((t) => (
              <AmmoTypeCard key={t.id} type={t} isAdmin={isCompanyAdmin(user.role)} />
            ))}
          </div>
        </section>
      ))}

      {shown.length === 0 && overview.length > 0 && (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין סוגים התואמים לסינון</p>
        </Card>
      )}
    </div>
  );
}

function AmmoTypeCard({ type: t, isAdmin }: { type: AmmoTypeOverview; isAdmin: boolean }) {
  const pct = t.minThreshold ? Math.min(100, Math.round((t.total / t.minThreshold) * 100)) : 100;
  return (
    <Card className="gap-3 pb-0">
      <CardHeader className="gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t.name}
          {t.ammoCategory && <Badge variant={CATEGORY_BADGE[t.ammoCategory]}>{AMMO_CATEGORY_LABELS[t.ammoCategory]}</Badge>}
          {!t.isActive && <Badge variant="outline">מושבת בקטלוג</Badge>}
        </CardTitle>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums">{formatNumber(t.total)}</p>
            <p className="text-muted-foreground text-xs">
              {t.minThreshold ? `סף מינימום ${formatNumber(t.minThreshold)}` : "לא הוגדר סף"}
              {t.lastCountedAt && ` · ספירה אחרונה ${formatDaysAgo(t.lastCountedAt)}`}
            </p>
          </div>
          <Badge variant={LEVEL_BADGE[t.level]}>{AMMO_LEVEL_LABELS[t.level]}</Badge>
        </div>
        {t.minThreshold ? <Progress value={pct} indicatorClassName={LEVEL_BAR[t.level]} aria-label="מלאי מול סף" /> : null}
      </CardHeader>
      <CardContent className="border-t px-0">
        {t.ammoStocks.length === 0 ? (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">אין מלאי רשום</span>
            {t.isActive && (
              <Link href={`/ammo?add=${t.id}`} className="text-primary flex items-center gap-1 font-medium" scroll={false}>
                <Plus className="size-4" />
                פתיחת מיקום
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {t.ammoStocks.map((s) => (
              <StockRow key={s.id} stock={s} isAdmin={isAdmin} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
