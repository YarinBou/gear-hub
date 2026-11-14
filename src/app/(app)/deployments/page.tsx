import type { Metadata } from "next";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { isCompanyAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CloseDeploymentButton, StartDeploymentForm, ViewDeploymentButton } from "./deployment-forms";

export const metadata: Metadata = { title: "הפעלות" };

export default async function DeploymentsPage() {
  await connection();
  const { user, deployment: viewed } = await companyContext();
  const isAdmin = isCompanyAdmin(user.role);
  // Every deployment of the company (the page's own `db` is filtered to the viewed one).
  const deployments = await scopedDb(user.companyId).deployment.findMany({
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdBy: { select: { name: true } },
      _count: {
        select: {
          personalKits: { where: { soldierId: { not: null } } },
          assignments: { where: { soldierId: { not: null } } },
          ammoStocks: true,
        },
      },
    },
  });
  const active = deployments.find((d) => d.status === "ACTIVE") ?? null;
  const latest = active ?? deployments.find((d) => d.status === "CLOSED") ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">הפעלות</h1>
        <p className="text-muted-foreground text-sm">
          הסד&quot;כ, הקטלוג והציוד שייכים לפלוגה. מי חתום על מה — צל&quot;ם, ערכות אישיות ותחמושת — נשמר לכל הפעלה בנפרד.
          הפעלות שהסתיימו נשמרות לצפייה בלבד.
        </p>
      </div>

      {!active && (
        <Card className="gap-1 px-5 py-4">
          <p className="font-medium">אין הפעלה פעילה</p>
          <p className="text-muted-foreground text-sm">
            כל הציוד בנשקייה ואף אחד לא חתום על ציוד. {isAdmin ? "פתחו הפעלה כדי להתחיל להחתים." : "מנהל הפלוגה יכול לפתוח הפעלה."}
          </p>
        </Card>
      )}

      {isAdmin && <StartDeploymentForm activeName={active?.name ?? null} previousName={latest?.name ?? null} />}

      <Card className="gap-0 py-0">
        {deployments.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">עדיין לא נפתחו הפעלות.</p>
        ) : (
          <ul className="divide-y">
            {deployments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {d.name}
                    {d.status === "ACTIVE" ? <Badge>פעילה</Badge> : <Badge variant="secondary">הסתיימה</Badge>}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(d.startedAt)}
                    {d.endedAt ? ` – ${formatDate(d.endedAt)}` : " – היום"}
                    {d.createdBy ? ` · נפתחה ע"י ${d.createdBy.name}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {d._count.personalKits} ערכות מונפקות · {d._count.assignments} פריטי צל&quot;ם אצל לוחמים · {d._count.ammoStocks} מיקומי תחמושת
                  </p>
                </div>
                <ViewDeploymentButton id={d.id} viewing={viewed?.id === d.id} />
                {isAdmin && d.status === "ACTIVE" && <CloseDeploymentButton id={d.id} name={d.name} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
