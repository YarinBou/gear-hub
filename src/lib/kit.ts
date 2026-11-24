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
  /** אופציונלי: part of the kit only when signed for (baseline) or required by the kit's פק"ל. */
  optional?: boolean;
  /** How many the kit's פק"ל requires on this line (null / absent = not required by it). */
  pakalQuantity?: number | null;
};

type ExpectedInput = Pick<ChecklistLine, "targetQuantity" | "baseline" | "optional" | "pakalQuantity">;
type LineState = ExpectedInput & Pick<ChecklistLine, "present" | "quantity">;

/**
 * How many this kit should have on this line; null = the line isn't part of this kit.
 * - Required by the kit's פק"ל: always part of it, at least the פק"ל's quantity (or what was signed, if more).
 * - Signed for (baseline): what was signed; 0 = not part of this kit.
 * - Not signed for yet: the company's target, unless the item is optional.
 */
export function expectedOf(line: ExpectedInput): number | null {
  const counted = line.targetQuantity != null;
  if (line.pakalQuantity != null) return counted ? Math.max(line.pakalQuantity, line.baseline ?? 0) : 1;
  if (line.baseline === 0) return null;
  if (line.baseline != null) return counted ? line.baseline : 1;
  if (line.optional) return null;
  return counted ? line.targetQuantity : 1;
}

/** How many the soldier has right now (present = 1). */
export function haveOf(line: Pick<ChecklistLine, "targetQuantity" | "present" | "quantity">): number {
  return line.targetQuantity != null ? (line.quantity ?? 0) : line.present ? 1 : 0;
}

/** Whether the line is part of this kit (not excluded by what the soldier signed for). */
export function lineApplies(line: ExpectedInput) {
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
export const DEFAULT_KIT_ITEMS: {
  label: string;
  groupName: string;
  systemKey?: string;
  targetQuantity?: number;
  /** Overrides the company's start setting (a kit in stock keeps its magazines and rounds). */
  startPresent?: boolean;
  /** Only in kits whose soldier signs for it or whose פק"ל requires it (e.g. drums). */
  optional?: boolean;
}[] = [
  { label: "נשק אישי", groupName: "נשק אישי", systemKey: WEAPON_ITEM },
  { label: "מחסניות", groupName: "תחמושת", targetQuantity: 7, startPresent: true },
  { label: "כדורים", groupName: "תחמושת", targetQuantity: 210, startPresent: true },
  { label: "תופי נגב", groupName: "תחמושת", targetQuantity: 4, startPresent: false, optional: true },
  { label: 'תופי מא"ג', groupName: "תחמושת", targetQuantity: 4, startPresent: false, optional: true },
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
          optional: true,
          isActive: true,
        },
      },
    },
  },
  pakal: { select: { id: true, name: true, color: true, items: { select: { itemId: true, quantity: true } } } },
} as const;

/** A kit's פק"ל as checklistLines() takes it. */
export type KitPakal = { items: { itemId: string; quantity: number }[] } | null;

type DefFields = Omit<ChecklistLine, "itemId" | "present" | "quantity" | "baseline" | "pakalQuantity">;

type StatusRow = {
  present: boolean;
  quantity: number | null;
  baseline: number | null;
  item: DefFields & { id: string; isActive: boolean };
};

/**
 * A kit's checklist lines. In a live deployment: the company's active items (an item without a
 * row yet reads as missing). In a closed deployment: exactly the rows recorded then, even for
 * items deactivated since.
 */
export function checklistLines(
  rows: StatusRow[],
  opts: { history: boolean; activeDefs?: (DefFields & { id: string })[]; pakal?: KitPakal },
): ChecklistLine[] {
  const required = new Map(opts.pakal?.items.map((i) => [i.itemId, i.quantity]) ?? []);
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
    optional: r.item.optional ?? false,
    pakalQuantity: required.get(r.item.id) ?? null,
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
  /** Total in returned kits waiting in the company's stock (not counted in have / missing). */
  stock: number;
};

/**
 * Sum the checklist over kits, per line. Issued kits count as signed / have / missing; returned
 * kits in stock (`inStock`) only add what is in them to `stock`.
 */
export function summarizeKits(kits: { signed: boolean; inStock?: boolean; lines: ChecklistLine[] }[]): KitSummaryLine[] {
  const rows = new Map<string, KitSummaryLine>();
  for (const k of kits) {
    for (const l of k.lines) {
      let r = rows.get(l.itemId);
      if (!r) {
        r = { itemId: l.itemId, label: l.label, groupName: l.groupName, sortOrder: l.sortOrder, signed: 0, have: 0, missing: 0, stock: 0 };
        rows.set(l.itemId, r);
      }
      const have = haveOf(l);
      if (k.inStock) {
        r.stock += have;
        continue;
      }
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

// ───────────── Kit return (זיכוי ערכה) ─────────────

/** One line checked when a kit is returned: what was signed for ("לפני") vs what came back ("אחרי"). */
export type ReturnCheckLine = {
  /** Checklist item id. */
  key: string;
  label: string;
  groupName: string;
  expected: number;
  /** true = counted (enter a number); false = came back / didn't. */
  counted: boolean;
};

/** A recorded line of a return (KitReturn.lines). */
export type ReturnLine = { label: string; expected: number; returned: number; note?: string };


/**
 * What has to come back when a kit is returned: every checklist line that is part of the kit
 * (magazines, rounds and drums are checklist lines too). The personal weapon itself is not part of
 * it — it is returned separately, on the צל"ם side.
 */
export function returnCheckLines(lines: ChecklistLine[]): ReturnCheckLine[] {
  const out: ReturnCheckLine[] = [];
  for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (l.systemKey === WEAPON_ITEM) continue;
    const expected = expectedOf(l);
    if (expected == null || expected <= 0) continue;
    out.push({ key: l.itemId, label: l.label, groupName: l.groupName, expected, counted: l.targetQuantity != null });
  }
  return out;
}

/** KitReturn.lines (JSON) as clean lines; anything malformed is dropped. */
export function parseReturnLines(json: unknown): ReturnLine[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { label, expected, returned, note } = x as Record<string, unknown>;
    if (typeof label !== "string" || !Number.isInteger(expected) || !Number.isInteger(returned)) return [];
    return [{ label, expected: expected as number, returned: returned as number, ...(typeof note === "string" && note ? { note } : {}) }];
  });
}

/** Lines that came back short. */
export function returnGaps(lines: ReturnLine[]) {
  return lines.filter((l) => l.returned < l.expected);
}

/** "מחסניות (5/7)" / "קסדה" — a short description of a gap. */
export function describeGap(l: ReturnLine) {
  return l.expected > 1 ? `${l.label} (${l.returned}/${l.expected})` : l.label;
}

// ───────────── Contents check (בדיקת תכולה) ─────────────

/**
 * How much of the kit a signature covers: of the lines every kit is expected to hold (not optional,
 * or required by its פק"ל; not the weapon, which is returned on the צל"ם side), how many the soldier
 * signed for. A kit signed for only a few lines (e.g. just a rifle strap) doesn't tell what's in the bag.
 */
export function signatureCoverage(lines: ChecklistLine[]) {
  const expected = lines.filter((l) => l.systemKey !== WEAPON_ITEM && (!l.optional || l.pakalQuantity != null));
  return { signed: expected.filter((l) => (l.baseline ?? 0) > 0).length, total: expected.length };
}

/** Whether a signature covers the whole kit. */
export function coversWholeKit(lines: ChecklistLine[]) {
  const c = signatureCoverage(lines);
  return c.signed === c.total;
}

/**
 * A kit in stock: are its real contents known?
 * - checked: every line was checked (a full contents check, or the return of a kit signed in full);
 * - partial: it was returned, but the signature covered only part of the bag;
 * - unchecked: nobody signed for it or checked it — it hasn't been opened.
 */
export type StockCheckState = "checked" | "partial" | "unchecked";

export function stockCheckState(kit: { contentsCheckedAt: Date | null; returned: boolean }): StockCheckState {
  if (kit.contentsCheckedAt) return "checked";
  return kit.returned ? "partial" : "unchecked";
}

export const STOCK_CHECK_LABELS: Record<StockCheckState, string> = {
  checked: "נבדק",
  partial: "בדיקה חלקית",
  unchecked: "לא נבדק",
};
