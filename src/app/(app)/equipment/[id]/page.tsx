import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Backpack, History, PackagePlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { EQUIPMENT_STATUS_LABELS, PLATOON_LABELS } from "@/lib/constants";
import { isStale } from "@/lib/equipment-rules";
import { getEquipmentCategories, getEquipmentItem, type EquipmentDetail } from "@/lib/queries/equipment";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { formatDateTime, formatDaysAgo } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { EquipmentStatusBadge } from "@/components/equipment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignForm, DeleteItem, DetailsForm, VerifyNowButton } from "./item-forms";

export const metadata: Metadata = { title: 'פריט צל"ם' };

export default async function EquipmentItemPage({ params }: PageProps<"/equipment/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [item, soldiers, categories] = await Promise.all([
    getEquipmentItem(id),
    getSoldierOptions(),
    getEquipmentCategories(),
  ]);
  if (!item) notFound();
  const stale = isStale(item);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <BackLink href="/equipment" label='חזרה לצל"ם' />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {item.category.name}
            <span className="ltr-text font-mono">{item.serialNumber}</span>
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <EquipmentStatusBadge status={item.status} />
            {item.assignedSoldier ? (
              <Link href={`/roster/${item.assignedSoldier.id}`} className="text-foreground font-medium hover:underline">
                {item.assignedSoldier.name}
              </Link>
            ) : (
              <span>לא משויך ללוחם</span>
            )}
            {item.platoon && <span>· {PLATOON_LABELS[item.platoon]}</span>}
            {item.personalKit && (
              <Link href={`/kits/${item.personalKit.kitNumber}`} className="hover:underline">
                <Badge variant="outline">
                  <Backpack />
                  נשק אישי בערכה {item.personalKit.kitNumber}
                </Badge>
              </Link>
            )}
          </div>
          <p className={stale ? "text-warning-foreground dark:text-warning text-sm font-medium" : "text-muted-foreground text-sm"}>
            אימות אחרון: {formatDaysAgo(item.lastVerifiedAt)}
            {item.lastVerifiedAt && ` (${formatDateTime(item.lastVerifiedAt)})`}
          </p>
        </div>
        <VerifyNowButton itemId={item.id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>שיוך וסטטוס</CardTitle>
              <CardDescription>המחלקה מתעדכנת אוטומטית לפי הלוחם. כל שינוי נרשם ביומן.</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignForm
                itemId={item.id}
                soldiers={soldiers}
                current={{
                  soldierId: item.assignedSoldierId,
                  status: item.status,
                  platoon: item.platoon,
                  holder: item.assignedSoldier
                    ? { ...item.assignedSoldier, personalNumber: null }
                    : undefined,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>פרטי פריט</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailsForm
                itemId={item.id}
                categories={categories}
                current={{
                  categoryId: item.category.id,
                  categoryName: item.category.name,
                  serialNumber: item.serialNumber,
                  notes: item.notes,
                }}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <HistoryCard logs={item.logs} />
          {user.role === "ADMIN" && (
            <Card className="py-4">
              <CardContent>
                <DeleteItem itemId={item.id} serial={item.serialNumber} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ logs }: { logs: EquipmentDetail["logs"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> יומן העברות
        </CardTitle>
        <CardDescription>{logs.length ? `${logs.length} רשומות` : "אין רשומות"}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative flex flex-col gap-4 border-s ps-5">
          {logs.map((log) => {
            const created = log.note === "נקלט במערכת" && !log.fromStatus;
            const holderChanged = log.fromSoldierId !== log.toSoldierId;
            const statusChanged = log.fromStatus !== log.toStatus;
            const Icon = created ? PackagePlus : ArrowLeftRight;
            return (
              <li key={log.id} className="relative">
                <span className="bg-card absolute -start-[1.85rem] top-0.5 flex size-5 items-center justify-center rounded-full border">
                  <Icon className="text-muted-foreground size-3" />
                </span>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(log.createdAt)}
                  {log.performedBy && ` · ${log.performedBy.name}`}
                </p>
                <div className="mt-1 flex flex-col gap-0.5 text-sm">
                  {created ? (
                    <p className="font-medium">
                      נקלט במערכת
                      {log.toSoldier ? ` ומשויך ל${log.toSoldier.name}` : ""}
                    </p>
                  ) : (
                    <>
                      {holderChanged && (
                        <p>
                          <span className="font-medium">{log.fromSoldier?.name ?? "פלוגה"}</span>
                          {" ← "}
                          <span className="font-medium">{log.toSoldier?.name ?? "פלוגה"}</span>
                        </p>
                      )}
                      {statusChanged && log.fromStatus && log.toStatus && (
                        <p className="text-muted-foreground">
                          {EQUIPMENT_STATUS_LABELS[log.fromStatus]} ← {EQUIPMENT_STATUS_LABELS[log.toStatus]}
                        </p>
                      )}
                      {!holderChanged && !statusChanged && log.platoon && (
                        <p className="text-muted-foreground">שויך ל{PLATOON_LABELS[log.platoon]}</p>
                      )}
                      {log.note && log.note !== "נקלט במערכת" && <p className="text-muted-foreground">&quot;{log.note}&quot;</p>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
