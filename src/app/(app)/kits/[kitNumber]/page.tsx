import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardList, Crosshair, History, PenLine, Printer, UserRound } from "lucide-react";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard, ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { PLATOONS, TOTAL_KITS } from "@/lib/constants";
import { KIT_ITEMS, KIT_ITEM_KEYS, kitReadiness, type KitBooleanKey } from "@/lib/kit";
import { getKit, getKitNeighbours, getSoldiersWithKit, getWeaponOptions } from "@/lib/queries/kits";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { formatDateTime, formatDaysAgo } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { PlatoonBadge } from "@/components/platoon-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Platoon } from "@/generated/prisma/enums";
import { AssignKitForm, WeaponForm } from "./kit-forms";
import { KitChecklist } from "./kit-checklist";
import { SignaturePad } from "./signature-pad";

export const metadata: Metadata = { title: "ערכה אישית" };

const LABEL_BY_KEY = new Map(KIT_ITEMS.map((i) => [i.key, i.label]));

export default async function KitPage({ params, searchParams }: PageProps<"/kits/[kitNumber]">) {
  const { deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="ערכות אישיות והחתמות" />;
  const [{ kitNumber: raw }, sp] = await Promise.all([params, searchParams]);
  const kitNumber = Number(raw);
  if (!Number.isInteger(kitNumber) || kitNumber < 1 || kitNumber > TOTAL_KITS) notFound();
  // Inspection walk can be scoped to one platoon: /kits/12?platoon=PLATOON_2
  const platoon = PLATOONS.includes(sp.platoon as Platoon) ? (sp.platoon as Platoon) : undefined;

  const kit = await getKit(kitNumber);
  const soldierId = kit?.soldierId ?? null;
  const [allSoldiers, withKit, weapons, nav] = await Promise.all([
    getSoldierOptions(),
    getSoldiersWithKit(kitNumber),
    getWeaponOptions(soldierId, kit?.personalWeaponId ?? null),
    getKitNeighbours(kitNumber, platoon),
  ]);
  const assignable = allSoldiers.filter((s) => !withKit.has(s.id));

  const checklist = Object.fromEntries(KIT_ITEM_KEYS.map((k) => [k, kit?.[k] ?? false])) as Record<KitBooleanKey, boolean>;
  const readiness = kit ? kitReadiness(kit) : 0;
  const issued = !!kit?.soldier;
  const navHref = (n: number) => `/kits/${n}${platoon ? `?platoon=${platoon}` : ""}`;

  return (
    <ReadOnlyWhenClosed>
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <BackLink href={platoon ? `/kits?platoon=${platoon}` : "/kits"} label="כל הערכות" />
          {/* Walk through issued kits during a מסדר (RTL: previous is on the right) */}
          <nav aria-label="מעבר בין ערכות" className="flex items-center gap-1">
            <Button asChild={!!nav.prev} variant="outline" size="sm" disabled={!nav.prev}>
              {nav.prev ? (
                <Link href={navHref(nav.prev)} aria-label={`ערכה קודמת (${nav.prev})`}>
                  <ChevronRight />
                  {nav.prev}
                </Link>
              ) : (
                <span>
                  <ChevronRight />
                </span>
              )}
            </Button>
            <Button asChild={!!nav.next} variant="outline" size="sm" disabled={!nav.next}>
              {nav.next ? (
                <Link href={navHref(nav.next)} aria-label={`ערכה הבאה (${nav.next})`}>
                  {nav.next}
                  <ChevronLeft />
                </Link>
              ) : (
                <span>
                  <ChevronLeft />
                </span>
              )}
            </Button>
          </nav>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              ערכה {kitNumber}
              {issued ? (
                kit?.signedAt ? (
                  <Badge variant="success">הוחתם</Badge>
                ) : (
                  <Badge variant="warning">טרם הוחתם</Badge>
                )
              ) : (
                <Badge variant="secondary">לא הונפקה</Badge>
              )}
            </h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              {kit?.soldier ? (
                <>
                  <Link href={`/roster/${kit.soldier.id}`} className="text-foreground font-medium hover:underline">
                    {kit.soldier.name}
                  </Link>
                  <PlatoonBadge platoon={kit.soldier.platoon} />
                </>
              ) : (
                "הערכה במלאי הפלוגה"
              )}
              {` · ${readiness}% מלאה · ${kit?.lastInspectedAt ? `מסדר אחרון ${formatDaysAgo(kit.lastInspectedAt)}` : "טרם בוצע מסדר"}`}
            </p>
          </div>
          {issued && (
            <Button asChild variant="outline">
              <Link href={`/kits/${kitNumber}/sheet`}>
                <Printer />
                טופס החתמה
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" /> רשימת ציוד
              </CardTitle>
              <CardDescription>הקשה על פריט מחליפה בין קיים לחסר ונשמרת מיד</CardDescription>
            </CardHeader>
            <CardContent>
              <KitChecklist key={kitNumber} kitNumber={kitNumber} checklist={checklist} issued={issued} />
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-4" /> שיוך ללוחם
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AssignKitForm
                  key={soldierId ?? "none"}
                  kitNumber={kitNumber}
                  soldiers={assignable}
                  currentSoldierId={soldierId}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crosshair className="size-4" /> נשק אישי ותחמושת
                </CardTitle>
                {!issued && <CardDescription>יש לשייך את הערכה ללוחם תחילה</CardDescription>}
              </CardHeader>
              <CardContent>
                <WeaponForm
                  key={soldierId ?? "none"}
                  kitNumber={kitNumber}
                  options={weapons}
                  disabled={!issued}
                  current={{
                    rifleType: kit?.rifleType ?? null,
                    personalWeaponId: kit?.personalWeaponId ?? null,
                    magazineCount: kit?.magazineCount ?? 0,
                    ammoCount: kit?.ammoCount ?? 0,
                  }}
                />
              </CardContent>
            </Card>

            {issued && kit?.soldier && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PenLine className="size-4" /> החתמת הלוחם
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SignaturePad
                    key={kit.signedAt?.toISOString() ?? "unsigned"}
                    kitNumber={kitNumber}
                    soldierName={kit.soldier.name}
                    signature={
                      kit.signatureData && kit.signedAt
                        ? { data: kit.signatureData, signedAt: formatDateTime(kit.signedAt), signedBy: kit.signedBy?.name ?? null }
                        : null
                    }
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4" /> היסטוריית מסדרים
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!kit?.inspections.length ? (
                  <p className="text-muted-foreground text-sm">טרם בוצע מסדר</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {kit.inspections.map((ins) => (
                      <li key={ins.id} className="py-2">
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(ins.createdAt)}
                          {ins.performedBy && ` · ${ins.performedBy.name}`}
                        </p>
                        {ins.missingItems.length === 0 ? (
                          <p className="text-success font-medium">ערכה מלאה</p>
                        ) : (
                          <p>
                            <span className="text-danger font-medium">חסרים: </span>
                            {ins.missingItems.map((k) => LABEL_BY_KEY.get(k as KitBooleanKey) ?? k).join(", ")}
                          </p>
                        )}
                        {ins.note && <p className="text-muted-foreground">&quot;{ins.note}&quot;</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ReadOnlyWhenClosed>
  );
}
