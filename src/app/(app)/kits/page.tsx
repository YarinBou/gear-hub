import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardList, PenLine } from "lucide-react";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard } from "@/components/deployment-gate";
import { getPlatoons } from "@/lib/queries/platoons";
import type { PlatoonRef } from "@/lib/platoons";
import { listKits, type KitTile } from "@/lib/queries/kits";
import { applyKitView, KIT_FILTERS as FILTERS, kitViewQuery, partialSign, type KitFilter as Filter } from "@/lib/kit-filters";
import { cn, formatDayMonth } from "@/lib/utils";
import { STOCK_CHECK_LABELS } from "@/lib/kit";
import { PlatoonBadge, PlatoonDot } from "@/components/platoon-badge";
import { PakalBadge } from "@/components/pakal-badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "ציוד אישי והחתמות" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function tone(k: KitTile) {
  if (!k.soldier) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground" };
  if (k.readiness === 100) return { bar: "bg-success", text: "text-success" };
  if (k.readiness >= 75) return { bar: "bg-warning", text: "text-warning-foreground dark:text-warning" };
  return { bar: "bg-danger", text: "text-danger" };
}

export default async function KitsPage({ searchParams }: PageProps<"/kits">) {
  const { deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="ערכות אישיות והחתמות" />;
  const sp = await searchParams;
  const platoonRaw = first(sp.platoon);
  const platoons = await getPlatoons();
  const platoon = platoons.find((p) => p.id === platoonRaw)?.id;
  const filterRaw = first(sp.filter);
  const filter = filterRaw && filterRaw in FILTERS ? (filterRaw as Filter) : undefined;

  const all = await listKits();
  // פק"ל kits: the marks in use, and the ?pakal= filter ("any" = every פק"ל kit).
  const pakalsInUse = [...new Map(all.flatMap((k) => (k.pakal ? [[k.pakal.id, k.pakal] as const] : []))).values()].sort((a, b) =>
    a.name.localeCompare(b.name, "he"),
  );
  const pakalRaw = first(sp.pakal);
  const pakal = pakalRaw === "any" || pakalsInUse.some((p) => p.id === pakalRaw) ? pakalRaw : undefined;
  const issued = all.filter((k) => k.soldier);
  const avg = issued.length ? Math.round(issued.reduce((a, k) => a + k.readiness, 0) / issued.length) : 0;
  const full = issued.filter((k) => k.readiness === 100).length;
  const signed = issued.filter((k) => k.signedAt).length;

  const shown = applyKitView(all, { platoon, filter, pakal });

  const href = (next: { platoon?: string | null; filter?: Filter | null; pakal?: string | null }) => {
    const p = new URLSearchParams();
    const pl = next.platoon === undefined ? platoon : next.platoon;
    const f = next.filter === undefined ? filter : next.filter;
    const pk = next.pakal === undefined ? pakal : next.pakal;
    if (pl) p.set("platoon", pl);
    if (f) p.set("filter", f);
    if (pk) p.set("pakal", pk);
    const s = p.toString();
    return s ? `/kits?${s}` : "/kits";
  };
  const chip = (label: string, to: string, active: boolean, count?: number, dot?: PlatoonRef) => (
    <li key={label}>
      <Link
        href={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
        )}
      >
        {dot && <PlatoonDot platoon={dot} />}
        {label}
        {count !== undefined && <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>}
      </Link>
    </li>
  );
  // Kit links carry the view (platoon / filter / פק"ל) so the kit page's ‹ › walk the same kits.
  const kitHref = (n: number) => `/kits/${n}${kitViewQuery({ platoon, filter, pakal })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">ציוד אישי והחתמות</h1>
          <p className="text-muted-foreground text-sm">
            {issued.length} מתוך {all.length} ערכות הונפקו · {full} מלאות · {signed} הוחתמו
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={platoon ? `/kits/summary?platoon=${platoon}` : "/kits/summary"}>
            <ClipboardList />
            סיכום ציוד
          </Link>
        </Button>
      </div>

      <Card className="gap-2 px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">כשירות ממוצעת (ערכות שהונפקו)</span>
          <span className="text-lg font-bold tabular-nums">{avg}%</span>
        </div>
        <Progress value={avg} className="h-3" indicatorClassName={avg === 100 ? "bg-success" : avg >= 75 ? "bg-warning" : "bg-danger"} />
      </Card>

      <nav aria-label="סינון לפי מחלקה" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {chip("כל הפלוגה", href({ platoon: null }), !platoon)}
          {platoons.filter((p) => p.isActive || p.id === platoon).map((p) =>
            chip(
              p.name,
              href({ platoon: p.id }),
              platoon === p.id,
              issued.filter((k) => k.soldier?.platoon.id === p.id).length,
              p,
            ),
          )}
        </ul>
      </nav>
      <nav aria-label="סינון לפי מצב" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {chip("הכל", href({ filter: null }), !filter)}
          {(Object.keys(FILTERS) as Filter[]).map((f) =>
            chip(FILTERS[f].label, href({ filter: f }), filter === f, all.filter(FILTERS[f].test).length),
          )}
        </ul>
      </nav>

      {pakalsInUse.length > 0 && (
        <nav aria-label='סינון לפי פק"ל' className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {chip('כל התיקים', href({ pakal: null }), !pakal)}
            {chip('תיקי פק"ל', href({ pakal: "any" }), pakal === "any", all.filter((k) => k.pakal).length)}
            {pakalsInUse.map((p) => chip(p.name, href({ pakal: p.id }), pakal === p.id, all.filter((k) => k.pakal?.id === p.id).length))}
          </ul>
        </nav>
      )}

      {shown.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין ערכות התואמות לסינון</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {shown.map((k) => {
            const t = tone(k);
            return (
              <li key={k.kitNumber}>
                <Link
                  href={kitHref(k.kitNumber)}
                  className={cn(
                    "bg-card hover:border-primary/50 flex h-full flex-col gap-1.5 rounded-lg border p-2.5 transition-colors",
                    // In stock: checked (contents known) / partly checked / never opened.
                    k.stock?.state === "checked" && "border-success/60 bg-success/5",
                    k.stock?.state === "partial" && "border-warning/70 bg-muted/50 border-dashed",
                    k.stock?.state === "unchecked" && "bg-muted/50 border-dashed",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-lg font-bold tabular-nums">{k.kitNumber}</span>
                    {k.soldier && (
                      <span className={cn("text-xs font-semibold tabular-nums", t.text)}>{k.readiness}%</span>
                    )}
                  </div>
                  {k.pakal && <PakalBadge pakal={k.pakal} className="px-1 py-0 text-[10px]" />}
                  {/* No colored dot here: a pink platoon dot next to the bar read as "missing items". */}
                  {k.soldier ? (
                    <p className="truncate text-xs font-medium">{k.soldier.name}</p>
                  ) : (
                    <StockLine stock={k.stock!} missing={k.missing.length} />
                  )}
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${k.soldier ? k.readiness : 0}%` }} />
                  </div>
                  {k.soldier && (
                    <p className="text-muted-foreground flex items-center justify-between gap-1 text-[11px]">
                      <span className="shrink-0">
                        {partialSign(k) ? (
                          <span className="text-warning-foreground dark:text-warning font-medium">
                            חתימה חלקית {k.coverage!.signed}/{k.coverage!.total}
                          </span>
                        ) : k.missing.length ? (
                          `${k.missing.length} חסרים`
                        ) : (
                          "מלאה"
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-1">
                        <PlatoonBadge platoon={k.soldier.platoon} className="min-w-0 truncate px-1 py-0 text-[10px]" />
                        {k.signedAt && <PenLine className="size-3 shrink-0" aria-label="הוחתם" />}
                      </span>
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A kit in stock: is what's in it known? */
function StockLine({ stock, missing }: { stock: NonNullable<KitTile["stock"]>; missing: number }) {
  if (stock.state === "checked") {
    return (
      <p className="text-success flex items-center gap-1 truncate text-xs font-medium">
        <CheckCircle2 className="size-3.5 shrink-0" />
        נבדק {formatDayMonth(stock.checkedAt)}
        {missing > 0 && <span className="text-muted-foreground font-normal">· {missing} חסרים</span>}
      </p>
    );
  }
  return (
    <p className={cn("truncate text-xs", stock.state === "partial" ? "text-warning-foreground dark:text-warning font-medium" : "text-muted-foreground")}>
      {STOCK_CHECK_LABELS[stock.state]}
    </p>
  );
}
