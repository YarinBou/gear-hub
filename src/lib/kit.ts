// The personal-kit checklist (רשימת ציוד). Each company defines its own lines (KitItemDef, managed
// on /kits/items); each kit has a KitItemStatus per line. Pure helpers — safe for client and server.

/** systemKey of the personal-weapon line: fulfilled automatically when a rifle is linked. */
export const WEAPON_ITEM = "WEAPON";

/** One checklist line of one kit, as pages and readiness calculations see it. */
export type ChecklistLine = {
  itemId: string;
  label: string;
  groupName: string;
  sortOrder: number;
  /** Expected quantity; null = just present / missing. */
  targetQuantity: number | null;
  systemKey: string | null;
  present: boolean;
  quantity: number | null;
};

/** Complete = present, or (for counted items) at least the expected quantity. */
export function lineComplete(line: Pick<ChecklistLine, "targetQuantity" | "present" | "quantity">) {
  return line.targetQuantity != null ? (line.quantity ?? 0) >= line.targetQuantity : line.present;
}

/** Readiness 0–100. A kit with no checklist lines has nothing missing. */
export function kitReadiness(lines: Pick<ChecklistLine, "targetQuantity" | "present" | "quantity">[]): number {
  if (!lines.length) return 100;
  return Math.round((lines.filter(lineComplete).length / lines.length) * 100);
}

/** Lines that aren't complete, described for an inspection record ("מחסניות (5/7)"). */
export function missingDescriptions(lines: ChecklistLine[]) {
  return lines
    .filter((l) => !lineComplete(l))
    .map((l) => (l.targetQuantity != null ? `${l.label} (${l.quantity ?? 0}/${l.targetQuantity})` : l.label));
}

/** Lines grouped by section, in checklist order (a section sits where its first item is). */
export function groupLines<T extends Pick<ChecklistLine, "groupName" | "sortOrder">>(lines: T[]) {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: { groupName: string; lines: T[] }[] = [];
  for (const line of sorted) {
    const g = groups.find((x) => x.groupName === line.groupName);
    if (g) g.lines.push(line);
    else groups.push({ groupName: line.groupName, lines: [line] });
  }
  return groups;
}

/** The state a new kit's line starts in, per the company's "new kits start full / empty" setting. */
export function defaultStatus(def: { targetQuantity: number | null }, startPresent: boolean) {
  return def.targetQuantity != null
    ? { present: false, quantity: startPresent ? def.targetQuantity : 0 }
    : { present: startPresent, quantity: null };
}

/** The checklist every new company starts with (editable afterwards). */
export const DEFAULT_KIT_ITEMS: { label: string; groupName: string; systemKey?: string; targetQuantity?: number }[] = [
  { label: "נשק אישי", groupName: "נשק אישי", systemKey: WEAPON_ITEM },
  { label: "ערכת ניקוי", groupName: "כלי ניקוי ונשק" },
  { label: "רצועת נשק", groupName: "כלי ניקוי ונשק" },
  { label: "שמן נשק", groupName: "כלי ניקוי ונשק" },
  { label: "מדים (סט 1)", groupName: "ציוד אישי ללוחם" },
  { label: "מדים (סט 2)", groupName: "ציוד אישי ללוחם" },
  { label: "חגור עבודה", groupName: "ציוד אישי ללוחם" },
  { label: "שק שינה", groupName: "ציוד אישי ללוחם" },
  { label: "משקפי מגן", groupName: "ציוד אישי ללוחם" },
  { label: "מגני ברכיים", groupName: "ציוד אישי ללוחם" },
  { label: "תיק ציוד 90 ליטר", groupName: "ציוד אישי ללוחם" },
  { label: "וסט קרבי", groupName: "ציוד אישי ללוחם" },
  { label: "פלטות קרמיות", groupName: "ציוד אישי ללוחם" },
  { label: "קסדה", groupName: "ציוד אישי ללוחם" },
  { label: "חסם עורקים CAT", groupName: "ציוד אישי ללוחם" },
  { label: "פנס ראש", groupName: "ציוד אישי ללוחם" },
];

/** Prisma `select` for a kit's checklist rows with their definitions. */
export const kitItemsSelect = {
  items: {
    select: {
      present: true,
      quantity: true,
      item: {
        select: {
          id: true,
          label: true,
          groupName: true,
          sortOrder: true,
          targetQuantity: true,
          systemKey: true,
          isActive: true,
        },
      },
    },
  },
} as const;

type StatusRow = {
  present: boolean;
  quantity: number | null;
  item: Omit<ChecklistLine, "itemId" | "present" | "quantity"> & { id: string; isActive: boolean };
};

/**
 * A kit's checklist lines. In a live deployment: the company's active items (an item without a
 * row yet reads as missing). In a closed deployment: exactly the rows recorded then, even for
 * items deactivated since.
 */
export function checklistLines(
  rows: StatusRow[],
  opts: { history: boolean; activeDefs?: (Omit<ChecklistLine, "itemId" | "present" | "quantity"> & { id: string })[] },
): ChecklistLine[] {
  const toLine = (r: StatusRow): ChecklistLine => ({
    itemId: r.item.id,
    label: r.item.label,
    groupName: r.item.groupName,
    sortOrder: r.item.sortOrder,
    targetQuantity: r.item.targetQuantity,
    systemKey: r.item.systemKey,
    present: r.present,
    quantity: r.quantity,
  });
  if (opts.history) return rows.map(toLine).sort((a, b) => a.sortOrder - b.sortOrder);
  const byItem = new Map(rows.map((r) => [r.item.id, r]));
  return (opts.activeDefs ?? rows.filter((r) => r.item.isActive).map((r) => r.item))
    .map((d) => {
      const r = byItem.get(d.id);
      return r ? toLine(r) : { ...toLine({ present: false, quantity: null, item: { ...d, isActive: true } }) };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
