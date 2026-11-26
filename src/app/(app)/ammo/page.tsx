import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, FileText, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard, ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { AMMO_LEVEL_LABELS, isLowStock, type AmmoLevel } from "@/lib/ammo-rules";
import { AMMO_CATEGORY_LABELS } from "@/lib/constants";
import { getActiveCategories } from "@/lib/queries/catalog";
import { getAmmoLocations, getAmmoOverview, type AmmoTypeOverview } from "@/lib/queries/ammo";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { cn, formatDaysAgo, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AmmoCategory } from "@/generated/prisma/enums";
import { AddStockForm, AmmoOptionsProvider, StockRow, VerifyLocation } from "./ammo-forms";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "ניהול תחמושת" };

/** `?loc=` value for "held by soldiers" (any soldier). */
const SOLDIERS_LOC = "__soldiers__";

type Stock = AmmoTypeOverview["ammoStocks"][number];
const matchesLoc = (s: Stock, loc: string) => (loc === SOLDIERS_LOC ? !!s.soldier : !s.soldier && s.location === loc);

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
  const { user, deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="מלאי ותנועות תחמושת" />;
  const sp = await searchParams;
  const catRaw = first(sp.cat);
  const cat = CATEGORY_ORDER.includes(catRaw as AmmoCategory) ? (catRaw as AmmoCategory) : undefined;
  const lowOnly = first(sp.filter) === "low";
  const addFor = first(sp.add);
  const locRaw = first(sp.loc);

  const [overview, categories, locations, soldiers] = await Promise.all([
    getAmmoOverview(),
    getActiveCategories("AMMUNITION"),
    getAmmoLocations(),
    getSoldierOptions(),
  ]);

  const loc = locRaw && (locRaw === SOLDIERS_LOC || locations.includes(locRaw)) ? locRaw : undefined;
  const countAt = (l: string) => overview.filter((t) => t.ammoStocks.some((s) => matchesLoc(s, l))).length;
  const withSoldiers = countAt(SOLDIERS_LOC);

  // Filters combine: each link keeps the other active filters.
  const href = (p: { cat?: string; filter?: string; loc?: string }) => {
    const q = new URLSearchParams();
    if (p.cat) q.set("cat", p.cat);
    if (p.filter) q.set("filter", p.filter);
    if (p.loc) q.set("loc", p.loc);
    const qs = q.toString();
    return qs ? `/ammo?${qs}` : "/ammo";
  };
  const lowParam = lowOnly ? "low" : undefined;

  const low = overview.filter((t) => isLowStock(t.total, t.minThreshold));
  const shown = overview
    .filter((t) => !loc || t.ammoStocks.some((s) => matchesLoc(s, loc)))
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
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
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
    <ReadOnlyWhenClosed>
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">ניהול תחמושת</h1>
            <p className="text-muted-foreground text-sm">
              {overview.length} סוגים · {low.length ? `${low.length} מתחת לסף המינימום` : "כל הסוגים מעל הסף"}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/ammo/report">
              <FileText />
              דוח תחמושת
            </Link>
          </Button>
        </div>

        <nav aria-label="סינון" className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {chip("הכל", href({ loc }), !cat && !lowOnly, overview.length)}
            {chip("מתחת לסף", href({ filter: "low", loc }), lowOnly, low.length, low.length ? "warning" : undefined)}
            {CATEGORY_ORDER.map((c) =>
              chip(AMMO_CATEGORY_LABELS[c], href({ cat: c, loc }), cat === c, overview.filter((t) => t.ammoCategory === c).length),
            )}
          </ul>
        </nav>

        {(locations.length > 0 || withSoldiers > 0) && (
          <nav aria-label="סינון לפי מיקום" className="no-scrollbar -mx-4 overflow-x-auto px-4">
            <ul className="flex w-max items-center gap-2">
              <li className="text-muted-foreground flex items-center gap-1 text-sm">
                <MapPin className="size-4" />
                מיקום:
              </li>
              {chip("כל המיקומים", href({ cat, filter: lowParam }), !loc, overview.length)}
              {locations.map((l) => chip(l, href({ cat, filter: lowParam, loc: l }), loc === l, countAt(l)))}
              {withSoldiers > 0 && chip("אצל חיילים", href({ cat, filter: lowParam, loc: SOLDIERS_LOC }), loc === SOLDIERS_LOC, withSoldiers)}
            </ul>
          </nav>
        )}

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
          <AddStockForm key={addFor ?? "add"} categories={categories} locations={locations} soldiers={soldiers} defaultCategoryId={addFor} />
        )}

        {loc && (
          <VerifyLocation
            key={loc}
            label={loc === SOLDIERS_LOC ? "החיילים" : loc}
            rows={shown.flatMap((t) => t.ammoStocks.filter((s) => matchesLoc(s, loc)).map((s) => ({ id: s.id, quantity: s.quantity })))}
          />
        )}

        <AmmoOptionsProvider locations={locations} soldiers={soldiers}>
        {[...groups, ...(uncategorized.length ? [{ category: null, types: uncategorized }] : [])].map((g) => (
          <section key={g.category ?? "none"} className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-sm font-semibold">
              {g.category ? `תחמושת ${AMMO_CATEGORY_LABELS[g.category]}` : "ללא קטגוריה"}
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.types.map((t) => (
                <AmmoTypeCard key={t.id} type={t} location={loc} isAdmin={isCompanyAdmin(user.role)} />
              ))}
            </div>
          </section>
        ))}
        </AmmoOptionsProvider>

        {shown.length === 0 && overview.length > 0 && (
          <Card className="items-center py-10 text-center">
            <p className="text-muted-foreground">אין סוגים התואמים לסינון</p>
          </Card>
        )}
      </div>
    </ReadOnlyWhenClosed>
  );
}

function AmmoTypeCard({ type: t, location, isAdmin }: { type: AmmoTypeOverview; location?: string; isAdmin: boolean }) {
  // With a location filter: only that location's rows and quantity. Level/threshold stay company-wide.
  const stocks = location ? t.ammoStocks.filter((s) => matchesLoc(s, location)) : t.ammoStocks;
  const shownTotal = location ? stocks.reduce((a, s) => a + s.quantity, 0) : t.total;
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
            <p className="text-3xl font-bold tabular-nums">{formatNumber(shownTotal)}</p>
            <p className="text-muted-foreground text-xs">
              {location && `${location === SOLDIERS_LOC ? "אצל חיילים" : `ב${location}`} · סה״כ בפלוגה ${formatNumber(t.total)} · `}
              {t.minThreshold ? `סף מינימום ${formatNumber(t.minThreshold)}` : "לא הוגדר סף"}
              {t.lastCountedAt && ` · ספירה אחרונה ${formatDaysAgo(t.lastCountedAt)}`}
            </p>
          </div>
          <Badge variant={LEVEL_BADGE[t.level]}>{AMMO_LEVEL_LABELS[t.level]}</Badge>
        </div>
        {t.minThreshold ? <Progress value={pct} indicatorClassName={LEVEL_BAR[t.level]} aria-label="מלאי מול סף" /> : null}
      </CardHeader>
      <CardContent className="border-t px-0">
        {stocks.length === 0 ? (
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
            {stocks.map((s) => (
              <StockRow
                key={s.id}
                stock={s}
                isAdmin={isAdmin}
                siblings={t.ammoStocks.filter((x) => x.id !== s.id).map((x) => ({ id: x.id, location: x.location, isSoldier: !!x.soldier }))}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
