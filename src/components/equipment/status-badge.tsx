import { Badge } from "@/components/ui/badge";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import type { EquipmentStatus } from "@/generated/prisma/enums";

const VARIANT: Record<EquipmentStatus, "default" | "secondary" | "success" | "warning" | "danger" | "outline"> = {
  IN_ARMORY: "secondary",
  WITH_SOLDIER: "success",
  IN_REPAIR: "warning",
  STORED: "outline",
  MISSING: "danger",
};

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return <Badge variant={VARIANT[status]}>{EQUIPMENT_STATUS_LABELS[status]}</Badge>;
}
