// Properties of equipment types (מאפיינים): defined per type on /catalog, recorded on each item.
// e.g. ציין לייזר: ☐ קייס ☐ שלט PTT · אמר"ל: ☐ מתאם לקסדה · רומיאו: צבע (חום / שחור) ·
// רחפן: סוללות × 4, מדחפים × 8, ☐ כרטיס זיכרון…
// Pure — safe for client and server.

export type AttributeDef =
  | { key: string; label: string; kind: "check" }
  | { key: string; label: string; kind: "choice"; options: string[] }
  | { key: string; label: string; kind: "count" };

/** An item's values, by key: true / false for a check, an option for a choice, a number for a count. */
export type AttributeValues = Record<string, boolean | string | number>;

export const MAX_ATTRIBUTES = 12;
export const MAX_COUNT = 999;

type Preset = { label: string; kind: "check" } | { label: string; kind: "choice"; options: string[] } | { label: string; kind: "count" };
export const MAX_OPTIONS = 8;

/** Ready-made properties offered when defining a type (any label can also be typed). */
export const ATTRIBUTE_PRESETS: Preset[] = [
  { label: "קייס", kind: "check" },
  { label: "שלט PTT", kind: "check" },
  { label: "מתאם לקסדה", kind: "check" },
  { label: "צבע", kind: "choice", options: ["חום", "שחור"] },
];

/** Everything a drone kit is checked for — added in one go on /catalog. */
export const DRONE_PRESET: Preset[] = [
  { label: "סוללות", kind: "count" },
  { label: "מדחפים", kind: "count" },
  { label: "כרטיס זיכרון", kind: "check" },
  { label: "מטען סוללות", kind: "check" },
  { label: "מטען שלט", kind: "check" },
  { label: "כבל USB C-C", kind: "check" },
  { label: "כבל USB A-C", kind: "check" },
];

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/** EquipmentCategory.attributes (JSON) as clean definitions; anything malformed is dropped. */
export function parseAttributeDefs(json: unknown): AttributeDef[] {
  if (!Array.isArray(json)) return [];
  const out: AttributeDef[] = [];
  const keys = new Set<string>();
  for (const x of json) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const key = clean(r.key, 24);
    const label = clean(r.label, 30);
    if (!key || !label || keys.has(key) || !/^[a-z0-9_-]+$/i.test(key)) continue;
    if (r.kind === "check") out.push({ key, label, kind: "check" });
    else if (r.kind === "count") out.push({ key, label, kind: "count" });
    else if (r.kind === "choice") {
      const options = [...new Set((Array.isArray(r.options) ? r.options : []).map((o) => clean(o, 20)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (options.length < 2) continue;
      out.push({ key, label, kind: "choice", options });
    } else continue;
    keys.add(key);
    if (out.length >= MAX_ATTRIBUTES) break;
  }
  return out;
}

/** EquipmentItem.attributes (JSON), kept only where it matches the type's definitions. */
export function parseAttributeValues(json: unknown, defs: AttributeDef[]): AttributeValues {
  const raw = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const out: AttributeValues = {};
  for (const d of defs) {
    const v = raw[d.key];
    if (d.kind === "check" && typeof v === "boolean") out[d.key] = v;
    if (d.kind === "choice" && typeof v === "string" && d.options.includes(v)) out[d.key] = v;
    if (d.kind === "count" && typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT) out[d.key] = v;
  }
  return out;
}

/** "יש" / "אין" / "—" (not recorded) / the chosen option / the count. */
export function describeValue(def: AttributeDef, v: boolean | string | number | undefined) {
  if (v === undefined) return "—";
  if (def.kind === "check") return v ? "יש" : "אין";
  return String(v);
}

/** Whether a value fits the definition (used when saving). */
export function validValue(def: AttributeDef, v: unknown) {
  if (def.kind === "check") return typeof v === "boolean";
  if (def.kind === "choice") return typeof v === "string" && def.options.includes(v);
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;
}

/** Missing for the "חסר מאפיין" filter: a yes / no not marked "יש", or a count not recorded or 0. */
export function isMissing(def: AttributeDef, v: boolean | string | number | undefined) {
  if (def.kind === "check") return v !== true;
  if (def.kind === "count") return !v;
  return false;
}

/** Short tags for lists: "קייס", "בלי PTT", "חום", "סוללות × 4". Unrecorded values are left out. */
export function attributeTags(defs: AttributeDef[], values: AttributeValues) {
  return defs.flatMap((d) => {
    const v = values[d.key];
    if (v === undefined) return [];
    if (d.kind === "check") return [{ label: v ? d.label : `בלי ${d.label}`, missing: !v }];
    if (d.kind === "count") return [{ label: v ? `${d.label} × ${v}` : `בלי ${d.label}`, missing: !v }];
    return [{ label: String(v), missing: false }];
  });
}
