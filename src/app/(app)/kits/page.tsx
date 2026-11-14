import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard } from "@/components/deployment-gate";
import { PLATOONS, PLATOON_LABELS, TOTAL_KITS } from "@/lib/constants";
import { listKits, type KitTile } from "@/lib/queries/kits";
import { cn } from "@/lib/utils";
import { PlatoonDot } from "@/components/platoon-badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Platoon } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "ציוד אישי והחתמות" };

type Filter = "missing" | "unissued" | "unsigned";
const FILTERS: Record<Filter, { label: string; test: (k: KitTile) => boolean }> = {
  missing: { label: "חסרים פריטים", test: (k) => !!k.soldier && k.readiness < 100 },
  unsigned: { label: "לא הוחתמו", test: (k) => !!k.soldier && !k.signedAt },
  unissued: { label: "לא הונפקו", test: (k) => !k.soldier },
};

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
  const platoon = PLATOONS.includes(platoonRaw as Platoon) ? (platoonRaw as Platoon) : undefined;
  const filterRaw = first(sp.filter);
  const filter = filterRaw && filterRaw in FILTERS ? (filterRaw as Filter) : undefined;

  const all = await listKits();
  const issued = all.filter((k) => k.soldier);
  const avg = issued.length ? Math.round(issued.reduce((a, k) => a + k.readiness, 0) / issued.length) : 0;
  const full = issued.filter((k) => k.readiness === 100).length;
  const signed = issued.filter((k) => k.signedAt).length;

  const shown = all
    .filter((k) => !platoon || k.soldier?.platoon === platoon)
    .filter((k) => !filter || FILTERS[filter].test(k));

  const href = (next: { platoon?: Platoon | null; filter?: Filter | null }) => {
    const p = new URLSearchParams();
    const pl = next.platoon === undefined ? platoon : next.platoon;
    const f = next.filter === undefined ? filter : next.filter;
    if (pl) p.set("platoon", pl);
    if (f) p.set("filter", f);
    const s = p.toString();
    return s ? `/kits?${s}` : "/kits";
  };
  const chip = (label: string, to: string, active: boolean, count?: number, dot?: Platoon) => (
    <li key={label}>
      <Link
        href={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
        )}
      >
        {dot && <PlatoonDot platoon={dot} />}
        {label}
        {count !== undefined && <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>}
      </Link>
    </li>
  );
  // Kit links carry the platoon so prev/next on the kit page walks the same platoon.
  const kitHref = (n: number) => `/kits/${n}${platoon ? `?platoon=${platoon}` : ""}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ציוד אישי והחתמות</h1>
        <p className="text-muted-foreground text-sm">
          {issued.length} מתוך {TOTAL_KITS} ערכות הונפקו · {full} מלאות · {signed} הוחתמו
        </p>
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
          {PLATOONS.map((p) =>
            chip(
              PLATOON_LABELS[p],
              href({ platoon: p }),
              platoon === p,
              issued.filter((k) => k.soldier?.platoon === p).length,
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
                    !k.soldier && "bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tabular-nums">{k.kitNumber}</span>
                    {k.soldier && (
                      <span className={cn("text-xs font-semibold tabular-nums", t.text)}>{k.readiness}%</span>
                    )}
                  </div>
                  <p className={cn("flex items-center gap-1.5 truncate text-xs", k.soldier ? "font-medium" : "text-muted-foreground")}>
                    {k.soldier && <PlatoonDot platoon={k.soldier.platoon} />}
                    <span className="truncate">{k.soldier?.name ?? "לא הונפקה"}</span>
                  </p>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${k.soldier ? k.readiness : 0}%` }} />
                  </div>
                  {k.soldier && (
                    <p className="text-muted-foreground flex items-center justify-between text-[11px]">
                      <span>{k.missing.length ? `${k.missing.length} חסרים` : "מלאה"}</span>
                      {k.signedAt && <PenLine className="size-3" aria-label="הוחתם" />}
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
