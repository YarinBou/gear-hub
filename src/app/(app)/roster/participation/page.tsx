import type { Metadata } from "next";
import { companyContext } from "@/lib/context";
import { listSoldiers } from "@/lib/queries/soldiers";
import { NoDeploymentCard, ReadOnlyWhenClosed } from "@/components/deployment-gate";
import { BackLink } from "@/components/layout/back-link";
import { ParticipationForm } from "./participation-form";

export const metadata: Metadata = { title: "משתתפים בהפעלה" };

/** Who of the roster is in the viewed deployment. Default: everyone; untick who isn't. */
export default async function ParticipationPage() {
  const { deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="משתתפים" />;
  const soldiers = await listSoldiers({});

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink href="/roster" label='חזרה לסד"כ' />
      <div>
        <h1 className="text-2xl font-bold">משתתפים בהפעלה — {deployment.name}</h1>
        <p className="text-muted-foreground text-sm">
          כברירת מחדל כל הסד&quot;כ משתתף. מורידים את הסימון ממי שלא הגיע להפעלה הזו: הוא לא יופיע בבחירת לוחם לציוד, לערכות
          ולמארזים, ולא ניתן יהיה להחתים אותו. לוחם שמחזיק ציוד או ערכה צריך לזכות קודם.
        </p>
      </div>
      <ReadOnlyWhenClosed>
        <ParticipationForm
          soldiers={soldiers.map((s) => ({
            id: s.id,
            name: s.name,
            platoon: s.platoon,
            position: s.position,
            inDeployment: s.inDeployment !== false,
            holds: !!s.kit || s._count.equipment > 0,
          }))}
        />
      </ReadOnlyWhenClosed>
    </div>
  );
}
