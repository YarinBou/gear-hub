import { requireUser } from "@/lib/auth";
import { EQUIPMENT_STATUS_LABELS, PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { NO_SERIAL_LABEL, itemLabel } from "@/lib/equipment-rules";
import { getEquipmentReport } from "@/lib/queries/equipment";
import type { Platoon } from "@/generated/prisma/enums";

/** CSV cell: quote everything, double inner quotes; neutralize spreadsheet formulas. */
function cell(value: string | number | null | undefined) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Excel export of the company equipment report (one row per item).
 * UTF-8 with BOM so Excel shows Hebrew correctly when the file is double-clicked.
 */
export async function GET(request: Request) {
  await requireUser();
  const raw = new URL(request.url).searchParams.get("platoon");
  const platoon = PLATOONS.includes(raw as Platoon) ? (raw as Platoon) : undefined;
  const report = await getEquipmentReport(platoon);

  const header = ["אמצעי", 'צ / מס"ט', "מחלקה", "חייל", "מ.א", "סטטוס", "רכיב של", "רכיבים מצורפים", "הערות"];
  const rows: string[][] = [];
  for (const t of report) {
    for (const i of t.equipmentItems) {
      rows.push([
        t.name,
        i.serialNumber ?? NO_SERIAL_LABEL,
        i.platoon ? PLATOON_LABELS[i.platoon] : "",
        i.assignedSoldier?.name ?? "",
        i.assignedSoldier?.personalNumber ?? "",
        EQUIPMENT_STATUS_LABELS[i.status],
        i.parent ? itemLabel(i.parent) : "",
        i.components.map(itemLabel).join(", "),
        i.notes ?? "",
      ]);
    }
  }

  // Summary block (company-wide only: תקן comparisons don't apply to a single platoon).
  if (!platoon) {
    rows.push([], ["סיכום לפי אמצעי"], ["אמצעי", "מצאי", "תקן", "פער (חסרים)", "חסרים בפועל", "ללא צ"]);
    for (const t of report) {
      rows.push([
        t.name,
        String(t.held),
        t.targetQuantity != null ? String(t.targetQuantity) : "",
        t.gap != null ? String(Math.max(0, t.gap)) : "",
        String(t.missing),
        String(t.noSerial),
      ]);
    }
  }

  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gear-hub-equipment-${platoon ?? "company"}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
