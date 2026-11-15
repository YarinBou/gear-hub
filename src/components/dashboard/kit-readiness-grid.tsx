import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DashboardData, KitCell } from "@/lib/queries/dashboard";

function cellTone(k: KitCell) {
  if (!k.soldierName || k.readiness === null) return "bg-muted text-muted-foreground";
  if (k.readiness === 100) return "bg-success text-success-foreground";
  if (k.readiness >= 75) return "bg-warning text-warning-foreground";
  return "bg-danger text-danger-foreground";
}

const LEGEND = [
  { label: "מלאה", className: "bg-success" },
  { label: "75% ומעלה", className: "bg-warning" },
  { label: "מתחת ל-75%", className: "bg-danger" },
  { label: "לא הונפקה", className: "bg-muted border" },
];

export function KitReadinessGrid({ kits }: { kits: DashboardData["kits"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>כשירות ערכות אישיות</CardTitle>
        <CardDescription>
          {kits.issued} מתוך {kits.total} ערכות הונפקו · {kits.fullKits} מלאות · ממוצע {kits.avgReadiness}%
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Progress value={kits.avgReadiness} />
        <ul className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 xl:grid-cols-14" aria-label="מפת ערכות">
          {kits.cells.map((k) => {
            const label = k.soldierName
              ? `ערכה ${k.kitNumber} · ${k.soldierName}${k.platoon ? ` · ${k.platoon.name}` : ""} · ${k.readiness}%`
              : `ערכה ${k.kitNumber} · לא הונפקה`;
            return (
              <li key={k.kitNumber}>
                <Link
                  href={`/kits/${k.kitNumber}`}
                  title={label}
                  aria-label={label}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-transform hover:scale-105",
                    cellTone(k),
                  )}
                >
                  {k.kitNumber}
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm", l.className)} />
              {l.label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
