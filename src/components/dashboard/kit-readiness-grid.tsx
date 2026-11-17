import Link from "next/link";
import { AlertTriangle, Check, Minus, X, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DashboardData, KitCell } from "@/lib/queries/dashboard";

type Tone = { className: string; icon: LucideIcon; label: string };

// Color plus an icon shape per level, so the map does not depend on color alone.
const TONES = {
  full: { className: "bg-success text-success-foreground", icon: Check, label: "מלאה" },
  mostly: { className: "bg-warning text-warning-foreground", icon: AlertTriangle, label: "75% ומעלה" },
  low: { className: "bg-danger text-danger-foreground", icon: X, label: "מתחת ל-75%" },
  none: { className: "bg-muted text-muted-foreground", icon: Minus, label: "לא הונפקה" },
} satisfies Record<string, Tone>;

function toneOf(k: KitCell): Tone {
  if (!k.soldierName || k.readiness === null) return TONES.none;
  if (k.readiness === 100) return TONES.full;
  if (k.readiness >= 75) return TONES.mostly;
  return TONES.low;
}

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
        <Progress value={kits.avgReadiness} aria-label="כשירות ממוצעת" />
        <ul className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 xl:grid-cols-14" aria-label="מפת ערכות">
          {kits.cells.map((k) => {
            const tone = toneOf(k);
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
                    "focus-visible:ring-ring flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-xs font-semibold tabular-nums outline-none focus-visible:ring-[3px]",
                    tone.className,
                  )}
                >
                  <tone.icon className="size-3 opacity-80" aria-hidden />
                  {k.kitNumber}
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {Object.values(TONES).map((t) => (
            <li key={t.label} className="flex items-center gap-1.5">
              <span className={cn("flex size-4 items-center justify-center rounded-sm", t.className)}>
                <t.icon className="size-3" aria-hidden />
              </span>
              {t.label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
