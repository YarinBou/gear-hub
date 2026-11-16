import type { Metadata } from "next";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard } from "@/components/deployment-gate";
import { AMMO_CATEGORY_LABELS } from "@/lib/constants";
import { getAmmoOverview, type AmmoTypeOverview } from "@/lib/queries/ammo";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { PrintButton } from "@/components/print-button";
import type { AmmoCategory } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "דוח תחמושת" };

const CATEGORY_ORDER: AmmoCategory[] = ["STANDARD", "EXPLOSIVE", "NON_LETHAL"];

/**
 * Ammo report (דוח תחמושת) for print / PDF: quantity per type, grouped by ammo category with a
 * subtotal per category and a grand total. Deliberately no locations — only how much there is.
 */
export default async function AmmoReportPage() {
  await connection();
  const { user, deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="דוח תחמושת" />;

  const overview = await getAmmoOverview();
  const groups: { key: string; label: string; types: AmmoTypeOverview[]; subtotal: number }[] = [
    ...CATEGORY_ORDER.map((c) => ({
      key: c,
      label: `תחמושת ${AMMO_CATEGORY_LABELS[c]}`,
      types: overview.filter((t) => t.ammoCategory === c),
    })),
    { key: "none", label: "ללא קטגוריה", types: overview.filter((t) => !t.ammoCategory) },
  ]
    .filter((g) => g.types.length)
    .map((g) => ({ ...g, subtotal: g.types.reduce((a, t) => a + t.total, 0) }));  const grandTotal = groups.reduce((a, g) => a + g.subtotal, 0);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink href="/ammo" label="חזרה לתחמושת" />
        <PrintButton />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold">דוח תחמושת</h1>
          <p className="text-muted-foreground text-sm">
            {user.companyName} · {deployment.name}
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums">הופק {formatDateTime(now)}</p>
      </header>

      {groups.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center">אין סוגי תחמושת להצגה</p>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} className="bg-card break-inside-avoid overflow-hidden rounded-xl border print:rounded-none">
              <h2 className="bg-muted px-4 py-2 font-semibold">{g.label}</h2>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">סוג</th>
                    <th className="w-32 px-4 py-2 text-center font-medium">כמות</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {g.types.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2">{t.name}</td>
                      <td className="px-4 py-2 text-center">{formatNumber(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold tabular-nums">
                  <tr>
                    <td className="px-4 py-2">סה&quot;כ {g.label}</td>
                    <td className="px-4 py-2 text-center">{formatNumber(g.subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          ))}

          <section className="bg-card break-inside-avoid overflow-hidden rounded-xl border print:rounded-none">
            <h2 className="bg-muted px-4 py-2 font-semibold">סיכום</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y tabular-nums">
                {groups.map((g) => (
                  <tr key={g.key}>
                    <td className="px-4 py-2">{g.label}</td>
                    <td className="w-32 px-4 py-2 text-center">{formatNumber(g.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 text-base font-bold tabular-nums">
                <tr>
                  <td className="px-4 py-2.5">סה&quot;כ תחמושת</td>
                  <td className="px-4 py-2.5 text-center">{formatNumber(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
