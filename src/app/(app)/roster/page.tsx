import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Backpack, ChevronLeft, Crosshair, FileSpreadsheet, Search, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { getRosterCounts, listSoldiers } from "@/lib/queries/soldiers";
import { cn, formatNumber } from "@/lib/utils";
import { PlatoonBadge, PlatoonDot } from "@/components/platoon-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Platoon } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: 'ניהול סד"כ' };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  await requireUser();
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const platoonRaw = first(sp.platoon);
  const platoon = (PLATOONS as string[]).includes(platoonRaw ?? "") ? (platoonRaw as Platoon) : undefined;
  const includeInactive = first(sp.inactive) === "1";

  const [soldiers, counts] = await Promise.all([listSoldiers({ platoon, q, includeInactive }), getRosterCounts()]);

  const href = (next: { platoon?: Platoon | null; inactive?: boolean }) => {
    const params = new URLSearchParams();
    const p = next.platoon === undefined ? platoon : next.platoon;
    if (p) params.set("platoon", p);
    if (q) params.set("q", q);
    if (next.inactive ?? includeInactive) params.set("inactive", "1");
    const s = params.toString();
    return s ? `/roster?${s}` : "/roster";
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ניהול סד&quot;כ פלוגתי</h1>
          <p className="text-muted-foreground text-sm">{formatNumber(counts.total)} לוחמים פעילים</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/roster/import">
              <FileSpreadsheet />
              ייבוא מרוכז
            </Link>
          </Button>
          <Button asChild>
            <Link href={platoon ? `/roster/new?platoon=${platoon}` : "/roster/new"}>
              <UserPlus />
              הוספת לוחם
            </Link>
          </Button>
        </div>
      </div>

      {/* Platoon filter — horizontally scrollable chips on mobile */}
      <nav aria-label="סינון לפי מחלקה" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          <Chip href={href({ platoon: null })} active={!platoon} label="כל הפלוגה" count={counts.total} />
          {PLATOONS.map((p) => (
            <Chip
              key={p}
              href={href({ platoon: p })}
              active={platoon === p}
              label={PLATOON_LABELS[p]}
              count={counts.byPlatoon[p]}
              dot={p}
            />
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Form action="/roster" className="relative flex-1">
          {platoon && <input type="hidden" name="platoon" value={platoon} />}
          {includeInactive && <input type="hidden" name="inactive" value="1" />}
          <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="חיפוש לפי שם, מספר אישי, טלפון או תפקיד"
            aria-label="חיפוש בסד״כ"
            className="bg-card ps-9"
            enterKeyHint="search"
          />
        </Form>
        <Link
          href={href({ inactive: !includeInactive })}
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          {includeInactive ? "הסתרת לוחמים שהוצאו מהסד\"כ" : "הצגת לוחמים שהוצאו מהסד\"כ"}
        </Link>
      </div>

      {soldiers.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <p className="text-muted-foreground">{q ? `לא נמצאו לוחמים עבור "${q}"` : "אין עדיין לוחמים בסד\"כ"}</p>
          {!q && (
            <Button asChild variant="outline">
              <Link href="/roster/import">ייבוא רשימה מאקסל</Link>
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Mobile: tappable cards */}
          <Card className="gap-0 py-0 md:hidden">
            <ul className="divide-y">
              {soldiers.map((s) => (
                <li key={s.id}>
                  <Link href={`/roster/${s.id}`} className={cn("active:bg-accent flex items-center gap-3 px-4 py-3", !s.isActive && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{s.name}</span>
                        {!s.isActive && <Badge variant="secondary">לא פעיל</Badge>}
                      </p>
                      <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                        <PlatoonDot platoon={s.platoon} />
                        {[PLATOON_LABELS[s.platoon], s.position, s.personalNumber].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Holdings kit={s.kit?.kitNumber} equipment={s._count.equipment} />
                    <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {/* Desktop: table */}
          <Card className="hidden gap-0 py-0 md:flex">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">שם</th>
                  <th className="px-4 py-3 text-start font-medium">מחלקה</th>
                  <th className="px-4 py-3 text-start font-medium">תפקיד</th>
                  <th className="px-4 py-3 text-start font-medium">מספר אישי</th>
                  <th className="px-4 py-3 text-start font-medium">טלפון</th>
                  <th className="px-4 py-3 text-start font-medium">ציוד</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {soldiers.map((s) => (
                  <tr key={s.id} className={cn("hover:bg-accent/50 relative", !s.isActive && "opacity-60")}>
                    <td className="px-4 py-3 font-medium">
                      {/* Full-row link via stretched pseudo-element */}
                      <Link href={`/roster/${s.id}`} className="after:absolute after:inset-0">
                        {s.name}
                      </Link>
                      {!s.isActive && (
                        <Badge variant="secondary" className="ms-2">
                          לא פעיל
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PlatoonBadge platoon={s.platoon} />
                    </td>
                    <td className="px-4 py-3">{s.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="ltr-text tabular-nums">{s.personalNumber ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="ltr-text tabular-nums">{s.phone ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Holdings kit={s.kit?.kitNumber} equipment={s._count.equipment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
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
  dot,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  dot?: Platoon;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
        )}
      >
        {dot && <PlatoonDot platoon={dot} />}
        {label}
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
      </Link>
    </li>
  );
}

function Holdings({ kit, equipment }: { kit?: number; equipment: number }) {
  if (!kit && !equipment) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {kit && (
        <Badge variant="outline" title={`ערכה ${kit}`}>
          <Backpack />
          {kit}
        </Badge>
      )}
      {equipment > 0 && (
        <Badge variant="outline" title={`${equipment} פריטי צל"ם`}>
          <Crosshair />
          {equipment}
        </Badge>
      )}
    </span>
  );
}
