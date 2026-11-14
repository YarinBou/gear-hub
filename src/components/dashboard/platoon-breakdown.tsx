import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import { PlatoonDot } from "@/components/platoon-badge";
import type { DashboardData } from "@/lib/queries/dashboard";
import type { Platoon } from "@/generated/prisma/enums";

export function PlatoonBreakdown({ data }: { data: DashboardData }) {
  const kitsByPlatoon = Object.fromEntries(PLATOONS.map((p) => [p, { count: 0, sum: 0 }])) as Record<
    Platoon,
    { count: number; sum: number }
  >;
  for (const k of data.kits.cells) {
    if (k.platoon && k.readiness !== null) {
      kitsByPlatoon[k.platoon].count++;
      kitsByPlatoon[k.platoon].sum += k.readiness;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>תמונת מצב לפי מחלקה</CardTitle>
        <CardDescription>לוחמים, צל&quot;ם וכשירות ערכות</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[22rem] text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-b">
                <th className="py-2 text-start font-medium">מחלקה</th>
                <th className="py-2 text-center font-medium">לוחמים</th>
                <th className="py-2 text-center font-medium">צל&quot;ם</th>
                <th className="py-2 text-center font-medium">כשירות ערכות</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {PLATOONS.map((p) => {
                const k = kitsByPlatoon[p];
                return (
                  <tr key={p} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <PlatoonDot platoon={p} />
                        {PLATOON_LABELS[p]}
                      </span>
                    </td>
                    <td className="py-3 text-center">{formatNumber(data.roster.byPlatoon[p])}</td>
                    <td className="py-3 text-center">{formatNumber(data.equipment.byPlatoon[p])}</td>
                    <td className="py-3 text-center">{k.count ? `${Math.round(k.sum / k.count)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
