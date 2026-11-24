import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Backpack, Crosshair, PackagePlus, Phone } from "lucide-react";
import { companyContext } from "@/lib/context";
import { VERIFICATION_STALE_DAYS } from "@/lib/constants";
import { getSoldier, getSoldierReturnHistory } from "@/lib/queries/soldiers";
import { getFreeKitNumbers, getLooseItemOptions } from "@/lib/queries/kits";
import { getActivePlatoons } from "@/lib/queries/platoons";
import { daysAgo, formatDate } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { PlatoonBadge } from "@/components/platoon-badge";
import { PakalBadge } from "@/components/pakal-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSoldier } from "../actions";
import { SoldierForm } from "../soldier-form";
import { ActiveToggle, PresenceToggle } from "./active-toggle";
import { IssueKitForm } from "./issue-kit-form";
import { SoldierEquipment } from "./soldier-equipment";
import { SoldierLooseItems } from "./soldier-loose-items";
import { ReturnHistory } from "./return-history";
import { ReadOnlyWhenClosed } from "@/components/deployment-gate";

export const metadata: Metadata = { title: "כרטיס לוחם" };

export default async function SoldierPage({ params }: PageProps<"/roster/[id]">) {
  const { deployment } = await companyContext();
  const { id } = await params;
  const [soldier, active, history, looseOptions] = await Promise.all([
    getSoldier(id),
    getActivePlatoons(),
    getSoldierReturnHistory(id),
    getLooseItemOptions(),
  ]);
  if (!soldier) notFound();
  const staleBefore = daysAgo(VERIFICATION_STALE_DAYS);
  // A kit can be issued here: an active soldier who is in the active deployment and has none.
  const canIssueKit = !soldier.kit && soldier.isActive && soldier.inDeployment === true && !!deployment && !deployment.readOnly;
  const freeKits = canIssueKit ? await getFreeKitNumbers() : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <BackLink href={`/roster?platoon=${soldier.platoon.id}`} label='חזרה לסד"כ' />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {soldier.name}
            {!soldier.isActive && <Badge variant="secondary">הוצא מהסד&quot;כ</Badge>}
            {soldier.isActive && soldier.inDeployment === false && <Badge variant="outline">לא בהפעלה</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <PlatoonBadge platoon={soldier.platoon} />
            {soldier.position}
          </p>
        </div>
        {soldier.phone && (
          <a
            href={`tel:${soldier.phone}`}
            className="bg-card hover:bg-accent flex h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium"
          >
            <Phone className="size-4" />
            <span className="ltr-text">{soldier.phone}</span>
          </a>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>פרטי הלוחם</CardTitle>
          </CardHeader>
          <CardContent>
            <SoldierForm
              mode="edit"
              action={updateSoldier.bind(null, soldier.id)}
              platoons={active.some((p) => p.id === soldier.platoon.id) ? active : [...active, soldier.platoon]}
              initial={{
                name: soldier.name,
                platoon: soldier.platoon.id,
                position: soldier.position ?? "",
                personalNumber: soldier.personalNumber ?? "",
                phone: soldier.phone ?? "",
              }}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Backpack className="size-4" /> ערכה אישית
              </CardTitle>
            </CardHeader>
            <CardContent>
              {soldier.kit ? (
                <Link href={`/kits/${soldier.kit.kitNumber}`} className="hover:bg-accent -mx-2 flex items-center justify-between rounded-md px-2 py-2">
                  <span className="flex items-center gap-2 font-medium">
                    ערכה {soldier.kit.kitNumber}
                    <PakalBadge pakal={soldier.kit.pakal} />
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {soldier.kit.signedAt ? `הוחתם ${formatDate(soldier.kit.signedAt)}` : "טרם הוחתם"}
                  </span>
                </Link>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm">לא הונפקה ערכה</p>
                  {canIssueKit && <IssueKitForm soldierId={soldier.id} freeKits={freeKits} />}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crosshair className="size-4" /> צל&quot;ם משויך
              </CardTitle>
              <CardDescription>{soldier.equipment.length} פריטים</CardDescription>
            </CardHeader>
            <CardContent>
              <SoldierEquipment
                soldierId={soldier.id}
                canReturn={!!deployment && !deployment.readOnly}
                items={soldier.equipment.map((e) => ({
                  id: e.id,
                  serialNumber: e.serialNumber,
                  parentId: e.parentId,
                  category: e.category,
                  status: e.status,
                  stale: !e.lastVerifiedAt || e.lastVerifiedAt < staleBefore,
                }))}
              />
            </CardContent>
          </Card>

          {deployment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackagePlus className="size-4" /> פריטים מחוץ לתיק
                </CardTitle>
                <CardDescription>ציוד שנמסר ללוחם בנפרד מהערכה (למשל פק&quot;ל ירך, שק שינה)</CardDescription>
              </CardHeader>
              <CardContent>
                <SoldierLooseItems
                  soldierId={soldier.id}
                  rows={soldier.looseItems}
                  options={looseOptions}
                  canEdit={!deployment.readOnly && soldier.isActive && soldier.inDeployment === true}
                />
              </CardContent>
            </Card>
          )}

          {deployment && soldier.isActive && soldier.inDeployment !== null && (
            <ReadOnlyWhenClosed>
              <PresenceToggle id={soldier.id} deploymentName={deployment.name} inDeployment={soldier.inDeployment} />
            </ReadOnlyWhenClosed>
          )}
          <ActiveToggle id={soldier.id} isActive={soldier.isActive} />
        </div>
      </div>

      <ReturnHistory history={history} />
    </div>
  );
}
