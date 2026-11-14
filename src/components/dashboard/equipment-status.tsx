import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { cn, formatNumber } from "@/lib/utils";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import type { DashboardData } from "@/lib/queries/dashboard";

const STATUS_COLOR: Record<EquipmentStatus, string> = {
  IN_ARMORY: "bg-primary",
  WITH_SOLDIER: "bg-success",
  IN_REPAIR: "bg-warning",
  STORED: "bg-muted-foreground/50",
  MISSING: "bg-danger",
};

export function EquipmentStatusCard({ equipment }: { equipment: DashboardData["equipment"] }) {
  const total = equipment.total || 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>סטטוס צל&quot;ם</CardTitle>
        <CardDescription>{formatNumber(equipment.total)} פריטים ממוספרים</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="bg-muted flex h-3 overflow-hidden rounded-full" aria-hidden>
          {EQUIPMENT_STATUSES.map((s) => {
            const n = equipment.byStatus[s] ?? 0;
            return n ? <div key={s} className={STATUS_COLOR[s]} style={{ width: `${(n / total) * 100}%` }} /> : null;
          })}
        </div>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {EQUIPMENT_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_COLOR[s])} />
              <span className="text-muted-foreground">{EQUIPMENT_STATUS_LABELS[s]}</span>
              <span className="ms-auto font-semibold tabular-nums">{formatNumber(equipment.byStatus[s] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
