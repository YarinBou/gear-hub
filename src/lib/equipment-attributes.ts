// Properties of equipment types (מאפיינים): defined per type on /catalog, recorded on each item.
// e.g. ציין לייזר: ☐ קייס ☐ שלט PTT · אמר"ל: ☐ מתאם לקסדה · רומיאו: צבע (חום / שחור).
// Pure — safe for client and server.

export type AttributeDef =
  | { key: string; label: string; kind: "check" }
  | { key: string; label: string; kind: "choice"; options: string[] };

/** An item's values, by key: true / false for a check, an option for a choice. */
export type AttributeValues = Record<string, boolean | string>;

export const MAX_ATTRIBUTES = 8;
export const MAX_OPTIONS = 8;

/** Ready-made properties offered when defining a type (any label can also be typed). */
export const ATTRIBUTE_PRESETS: ({ label: string; kind: "check" } | { label: string; kind: "choice"; options: string[] })[] = [
  { label: "קייס", kind: "check" },
  { label: "שלט PTT", kind: "check" },
  { label: "מתאם לקסדה", kind: "check" },
  { label: "צבע", kind: "choice", options: ["חום", "שחור"] },
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
  }
  return out;
}

/** "יש" / "אין" / "—" (not recorded) / the chosen option. */
export function describeValue(def: AttributeDef, v: boolean | string | undefined) {
  if (v === undefined) return "—";
  if (def.kind === "check") return v ? "יש" : "אין";
  return String(v);
}

/** Short tags for lists: "קייס", "בלי PTT", "חום". Unrecorded values are left out. */
export function attributeTags(defs: AttributeDef[], values: AttributeValues) {
  return defs.flatMap((d) => {
    const v = values[d.key];
    if (v === undefined) return [];
    if (d.kind === "check") return [{ label: v ? d.label : `בלי ${d.label}`, missing: !v }];
    return [{ label: String(v), missing: false }];
  });
}
