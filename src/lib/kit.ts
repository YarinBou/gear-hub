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
  /**
   * What this soldier signed for (captured when the kit is signed, editable afterwards):
   * null = no personal baseline (the company's list applies), 0 = not part of this kit,
   * n = the signed quantity (1 for present / missing lines).
   */
  baseline: number | null;
};

type LineState = Pick<ChecklistLine, "targetQuantity" | "present" | "quantity" | "baseline">;

/** How many this kit should have on this line; null = the line isn't part of this kit. */
export function expectedOf(line: Pick<ChecklistLine, "targetQuantity" | "baseline">): number | null {
  if (line.baseline === 0) return null;
  if (line.targetQuantity != null) return line.baseline ?? line.targetQuantity;
  return 1;
}

/** How many the soldier has right now (present = 1). */
export function haveOf(line: Pick<ChecklistLine, "targetQuantity" | "present" | "quantity">): number {
  return line.targetQuantity != null ? (line.quantity ?? 0) : line.present ? 1 : 0;
}

/** Whether the line is part of this kit (not excluded by what the soldier signed for). */
export function lineApplies(line: Pick<ChecklistLine, "targetQuantity" | "baseline">) {
  return expectedOf(line) != null;
}


/**
 * Complete = has at least what's expected (present, or the expected quantity). A line that isn't
 * part of this kit is never missing.
 */
export function lineComplete(line: LineState) {
  const expected = expectedOf(line);
  return expected == null || haveOf(line) >= expected;
}

/** Readiness 0–100, over the lines that are part of this kit. A kit with none has nothing missing. */
export function kitReadiness(lines: LineState[]): number {
  const applicable = lines.filter(lineApplies);
  if (!applicable.length) return 100;
  return Math.round((applicable.filter(lineComplete).length / applicable.length) * 100);
}

/** Lines that aren't complete, described for an inspection record ("מחסניות (5/7)"). */
export function missingDescriptions(lines: ChecklistLine[]) {
  return lines
    .filter((l) => !lineComplete(l))
    .map((l) => (l.targetQuantity != null ? `${l.label} (${haveOf(l)}/${expectedOf(l)})` : l.label));
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

/** The state a new kit's line starts in, per the item's own start setting (present / missing). */
export function defaultStatus(def: { targetQuantity: number | null; startPresent: boolean }) {
  return def.targetQuantity != null
    ? { present: false, quantity: def.startPresent ? def.targetQuantity : 0 }
    : { present: def.startPresent, quantity: null };
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
      baseline: true,
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
  baseline: number | null;
  item: Omit<ChecklistLine, "itemId" | "present" | "quantity" | "baseline"> & { id: string; isActive: boolean };
};

/**
 * A kit's checklist lines. In a live deployment: the company's active items (an item without a
 * row yet reads as missing). In a closed deployment: exactly the rows recorded then, even for
 * items deactivated since.
 */
export function checklistLines(
  rows: StatusRow[],
  opts: { history: boolean; activeDefs?: (Omit<ChecklistLine, "itemId" | "present" | "quantity" | "baseline"> & { id: string })[] },
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
    baseline: r.baseline,
  });
  if (opts.history) return rows.map(toLine).sort((a, b) => a.sortOrder - b.sortOrder);
  const byItem = new Map(rows.map((r) => [r.item.id, r]));
  return (opts.activeDefs ?? rows.filter((r) => r.item.isActive).map((r) => r.item))
    .map((d) => {
      const r = byItem.get(d.id);
      return r ? toLine(r) : { ...toLine({ present: false, quantity: null, baseline: null, item: { ...d, isActive: true } }) };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** One row of the company-wide kit summary (סיכום ציוד בערכות). */
export type KitSummaryLine = {
  itemId: string;
  label: string;
  groupName: string;
  sortOrder: number;
  /** Total the soldiers signed for (signed kits only). */
  signed: number;
  /** Total actually in the kits right now. */
  have: number;
  /** Total short, kit by kit (one soldier's extra doesn't cover another's shortage). */
  missing: number;
};

/** Sum the checklist over kits, per line. */
export function summarizeKits(kits: { signed: boolean; lines: ChecklistLine[] }[]): KitSummaryLine[] {
  const rows = new Map<string, KitSummaryLine>();
  for (const k of kits) {
    for (const l of k.lines) {
      let r = rows.get(l.itemId);
      if (!r) {
        r = { itemId: l.itemId, label: l.label, groupName: l.groupName, sortOrder: l.sortOrder, signed: 0, have: 0, missing: 0 };
        rows.set(l.itemId, r);
      }
      const have = haveOf(l);
      const expected = expectedOf(l);
      r.have += have;
      if (expected != null) {
        if (k.signed) r.signed += expected;
        r.missing += Math.max(0, expected - have);
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}
