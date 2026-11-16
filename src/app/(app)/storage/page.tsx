import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { getStorageOverview, type StorageLine } from "@/lib/queries/storage";
import { fillPercent } from "@/lib/storage-rules";
import { cn, formatNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StorageRow } from "./storage-row";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: 'ציוד פלוגתי בימ"ח' };

type Filter = "shortage" | "expiry" | "damaged";
const FILTERS: Record<Filter, { label: string; test: (l: StorageLine) => boolean }> = {
  shortage: { label: "חוסר", test: (l) => l.flags.shortage },
  expiry: { label: `תוקף (${EXPIRY_WARNING_DAYS} יום)`, test: (l) => l.flags.expired || l.flags.expiringSoon },
  damaged: { label: "בלאי", test: (l) => l.damaged },
};

export default async function StoragePage({ searchParams }: PageProps<"/storage">) {
  const user = await requireUser();
  const raw = (await searchParams).filter;
  const filter = typeof raw === "string" && raw in FILTERS ? (raw as Filter) : undefined;

  const lines = await getStorageOverview();
  const target = lines.reduce((a, l) => a + l.targetQuantity, 0);
  const current = lines.reduce((a, l) => a + Math.min(l.currentQuantity, l.targetQuantity), 0);
  const fill = fillPercent(current, target);
  const shown = filter ? lines.filter(FILTERS[filter].test) : lines;

  const chip = (label: string, href: string, active: boolean, count: number, danger = false) => (
    <li key={label}>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
          !active && danger && count > 0 && "border-danger/50 text-danger",
        )}
      >
        {label}
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ציוד פלוגתי בימ&quot;ח</h1>
        <p className="text-muted-foreground text-sm">
          {lines.length} סוגי פריטים · לחיצה על שורה לעדכון מצאי, תקן ותוקף
        </p>
      </div>

      <Card className="gap-2 px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">מצאי מול תקן</span>
          <span className="text-lg font-bold tabular-nums">{fill}%</span>
        </div>
        <Progress value={fill} className="h-3" indicatorClassName={fill === 100 ? "bg-success" : fill >= 75 ? "bg-warning" : "bg-danger"} />
        <p className="text-muted-foreground text-xs">
          {formatNumber(current)} מתוך תקן {formatNumber(target)} פריטים
        </p>
      </Card>

      <nav aria-label="סינון" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {chip("הכל", "/storage", !filter, lines.length)}
          {(Object.keys(FILTERS) as Filter[]).map((f) =>
            chip(FILTERS[f].label, `/storage?filter=${f}`, filter === f, lines.filter(FILTERS[f].test).length, f !== "damaged"),
          )}
        </ul>
      </nav>

      {lines.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין פריטי בימ&quot;ח בקטלוג.</p>
          {isCompanyAdmin(user.role) && (
            <Link href="/catalog?domain=STORAGE" className="text-primary underline-offset-4 hover:underline">
              הוספת פריטים בקטלוג
            </Link>
          )}
        </Card>
      ) : shown.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין פריטים התואמים לסינון</p>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {shown.map((l) => (
              <StorageRow key={l.categoryId} line={l} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
