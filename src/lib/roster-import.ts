import type { Platoon } from "@/generated/prisma/enums";
import { fieldErrors, SoldierSchema, type SoldierInput } from "@/lib/validation/soldier";

// Pure parser for pasted roster rows (from Excel / Google Sheets / CSV).
// Runs in the browser for the live preview and again on the server before inserting.
//
// Column order: שם | מספר אישי | טלפון | תפקיד | מחלקה
// Only the name is required. If the platoon column is empty, the default platoon is used.

export const IMPORT_COLUMNS = ["שם מלא", "מספר אישי", "טלפון", "תפקיד", "מחלקה (אופציונלי)"] as const;
export const MAX_IMPORT_ROWS = 300;

export type ImportRow =
  | { line: number; ok: true; data: SoldierInput }
  | { line: number; ok: false; raw: string; error: string };

/** Maps free-text platoon values ("1", "מחלקה 2", "חפ\"ק", "מפלג", "HQ") to the enum. */
export function parsePlatoon(raw: string | undefined): Platoon | null {
  if (!raw) return null;
  const v = raw.replace(/["'״׳]/g, "").trim().toLowerCase();
  if (!v) return null;
  if (/^(מחלקה\s*)?1$|^platoon_1$/.test(v)) return "PLATOON_1";
  if (/^(מחלקה\s*)?2$|^platoon_2$/.test(v)) return "PLATOON_2";
  if (/^(מחלקה\s*)?3$|^platoon_3$/.test(v)) return "PLATOON_3";
  if (/חפק|מפלג|פלג|hq|מפקדה/.test(v)) return "HQ";
  return null;
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(",")) return line.split(",");
  if (line.includes(";")) return line.split(";");
  return [line];
}

function looksLikeHeader(cells: string[]) {
  return /שם|name/i.test(cells[0] ?? "") && !/\d/.test(cells[0] ?? "");
}

export function parseRosterText(text: string, defaultPlatoon: Platoon | null): ImportRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ImportRow[] = [];
  let first = true;

  lines.forEach((rawLine, i) => {
    if (!rawLine.trim()) return;
    const cells = splitLine(rawLine).map((c) => c.trim());
    if (first) {
      first = false;
      if (looksLikeHeader(cells)) return;
    }
    const [name, personalNumber, phone, position, platoonRaw] = cells;
    const platoon = parsePlatoon(platoonRaw) ?? defaultPlatoon;
    if (platoonRaw && !parsePlatoon(platoonRaw)) {
      rows.push({ line: i + 1, ok: false, raw: rawLine, error: `מחלקה לא מזוהה: "${platoonRaw}"` });
      return;
    }
    const parsed = SoldierSchema.safeParse({ name, personalNumber, phone, position, platoon: platoon ?? undefined });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      rows.push({ line: i + 1, ok: false, raw: rawLine, error: Object.values(errs)[0] ?? "שורה לא תקינה" });
      return;
    }
    rows.push({ line: i + 1, ok: true, data: parsed.data });
  });

  // Duplicate personal numbers inside the paste itself.
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r.ok || !r.data.personalNumber) return r;
    if (seen.has(r.data.personalNumber)) {
      return { line: r.line, ok: false, raw: r.data.name, error: "מספר אישי כפול ברשימה" };
    }
    seen.add(r.data.personalNumber);
    return r;
  });
}
