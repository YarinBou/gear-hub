import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Backpack, Boxes, CircleAlert, CircleCheck, History, Link2, PackagePlus } from "lucide-react";
import { companyContext } from "@/lib/context";
import { ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { getActivePlatoons } from "@/lib/queries/platoons";
import { isStale, itemLabel } from "@/lib/equipment-rules";
import {
  getComponentCandidates,
  getEquipmentCategories,
  getEquipmentItem,
  type EquipmentDetail,
} from "@/lib/queries/equipment";
import { getSoldierOptions } from "@/lib/queries/soldiers";
import { getSetsForCategory } from "@/lib/queries/sets";
import { missingSummary, setStatus } from "@/lib/equipment-sets";
import { formatDateTime, formatDaysAgo } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { Serial } from "@/components/equipment/serial";
import { EquipmentStatusBadge } from "@/components/equipment/status-badge";
import { PlatoonBadge } from "@/components/platoon-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AddNoSerialButton,
  AssignForm,
  ComponentsEditor,
  DeleteItem,
  DetachButton,
  DetailsForm,
  SetPicker,
  VerifyNowButton,
} from "./item-forms";
import { isCompanyAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: 'פריט צל"ם' };

export default async function EquipmentItemPage({ params }: PageProps<"/equipment/[id]">) {
  const { user, deployment } = await companyContext();
  const { id } = await params;
  const [item, soldiers, categories, platoons] = await Promise.all([
    getEquipmentItem(id),
    getSoldierOptions(),
    getEquipmentCategories(),
    getActivePlatoons(),
  ]);
  if (!item) notFound();
  const stale = isStale(item);
  // A component can't take components of its own (one level only).
  const [candidates, sets] = item.parent
    ? [[], []]
    : await Promise.all([getComponentCandidates(item), getSetsForCategory(item.categoryId)]);
  const setState = item.set ? setStatus(item.set.slots, item.components) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <BackLink href="/equipment" label='חזרה לצל"ם' />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {item.category.name}
            <Serial value={item.serialNumber} className={item.serialNumber ? undefined : "text-sm"} />
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
            <PlatoonBadge platoon={item.platoon} />
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
        {deployment && (
          <ReadOnlyWhenClosed>
            <VerifyNowButton itemId={item.id} />
          </ReadOnlyWhenClosed>
        )}
      </div>

      {item.parent && (
        <div className="bg-accent/60 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm">
          <Link2 className="size-4 shrink-0" />
          <span>
            רכיב של{" "}
            <Link href={`/equipment/${item.parent.id}`} className="font-semibold hover:underline">
              {itemLabel(item.parent)}
            </Link>
            . השיוך והסטטוס מתעדכנים יחד עם הפריט הראשי.
          </span>
          <DetachButton itemId={item.id} className="ms-auto" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>שיוך וסטטוס</CardTitle>
              {setState && !setState.complete && (
                <p className="bg-warning/15 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    מארז &quot;{item.set!.name}&quot; חסר: {missingSummary(setState)}. ניתן להחתים בכל זאת.
                  </span>
                </p>
              )}
              <CardDescription>
                {item.components.length
                  ? `השינוי יחול גם על ${item.components.length} הרכיבים המצורפים. כל שינוי נרשם ביומן.`
                  : "המחלקה מתעדכנת אוטומטית לפי הלוחם. כל שינוי נרשם ביומן."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {item.parent ? (
                <p className="text-muted-foreground text-sm">
                  לשינוי שיוך יש לעבור ל
                  <Link href={`/equipment/${item.parent.id}`} className="text-primary font-medium hover:underline">
                    פריט הראשי
                  </Link>
                  , או לנתק את הרכיב.
                </p>
              ) : !deployment ? (
                <p className="text-muted-foreground text-sm">
                  אין הפעלה פעילה — הפריט בנשקייה. שיוך ללוחם אפשרי רק בתוך הפעלה.
                </p>
              ) : (
                <ReadOnlyWhenClosed>
                  <AssignForm
                    itemId={item.id}
                    soldiers={soldiers}
                    platoons={platoons}
                    current={{
                      soldierId: item.assignedSoldierId,
                      status: item.status,
                      platoon: item.platoon,
                      holder: item.assignedSoldier ? { ...item.assignedSoldier, personalNumber: null } : undefined,
                    }}
                  />
                </ReadOnlyWhenClosed>
              )}
            </CardContent>
          </Card>
          {!item.parent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="size-4" /> מארז ורכיבים
                </CardTitle>
                <CardDescription>פריטים שעוברים יחד עם הפריט הזה (למשל ציין או קנס&quot;פ של נגב)</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ReadOnlyWhenClosed>
                  {(item.set || sets.length > 0) && (
                    <div className="flex flex-col gap-3">
                      <SetPicker itemId={item.id} current={item.set} sets={sets} />
                      {setState && (
                        <ul className="divide-y rounded-lg border">
                          {setState.lines.map((l) => (
                            <li key={l.categoryId} className="flex items-center gap-2 px-3 py-2 text-sm">
                              {l.missing > 0 ? (
                                <CircleAlert className="text-warning-foreground dark:text-warning size-4 shrink-0" />
                              ) : (
                                <CircleCheck className={l.have > 0 ? "text-success size-4 shrink-0" : "text-muted-foreground size-4 shrink-0"} />
                              )}
                              <span className="font-medium">{l.category.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {l.have}/{l.quantity}
                              </span>
                              {!l.required && <Badge variant="secondary">תוספת</Badge>}
                              {l.missing > 0 && <span className="text-warning-foreground dark:text-warning text-xs font-medium">חסר {l.missing}</span>}
                              {l.have < l.quantity && (
                                <span className="ms-auto">
                                  <AddNoSerialButton parentId={item.id} categoryId={l.categoryId} label={l.category.name} />
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <ComponentsEditor itemId={item.id} components={item.components} candidates={candidates} />
                </ReadOnlyWhenClosed>
              </CardContent>
            </Card>
          )}
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
          {isCompanyAdmin(user.role) && (
            <Card className="py-4">
              <CardContent>
                <DeleteItem itemId={item.id} label={itemLabel(item)} hasComponents={item.components.length > 0} />
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
            const created = !!log.note?.startsWith("נקלט במערכת") && !log.fromStatus;
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
                  {log.deployment && ` · ${log.deployment.name}`}
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
                        <p className="text-muted-foreground">שויך ל{log.platoon.name}</p>
                      )}
                      {log.note && !log.note.startsWith("נקלט במערכת") && <p className="text-muted-foreground">&quot;{log.note}&quot;</p>}
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
