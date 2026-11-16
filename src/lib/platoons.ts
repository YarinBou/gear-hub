// Platoons (מחלקות) are per-company rows managed by admins on /platoons — any number, any names.
// Pure helpers shared by server and client code.

/** What the UI needs to show a platoon. Select it with `platoon: platoonSelect`. */
export type PlatoonRef = { id: string; name: string; color: number };

export const platoonSelect = { select: { id: true, name: true, color: true } } as const;

/**
 * Identity palette. A platoon keeps the color it got when it was created (`Platoon.color`, an index
 * into this list), so colors do not shift when platoons are reordered. The hues live in globals.css
 * (`--platoon-1` … `--platoon-10`) and avoid red, amber and green on purpose: those mean
 * "missing", "needs attention" and "ok" everywhere else. Full class strings so Tailwind sees them.
 */
const PALETTE = [
  { stripe: "bg-platoon-1" }, // purple
  { stripe: "bg-platoon-2" }, // blue
  { stripe: "bg-platoon-3" }, // teal
  { stripe: "bg-platoon-4" }, // slate
  { stripe: "bg-platoon-5" }, // indigo
  { stripe: "bg-platoon-6" }, // cyan
  { stripe: "bg-platoon-7" }, // umber
  { stripe: "bg-platoon-8" }, // navy
  { stripe: "bg-platoon-9" }, // steel
  { stripe: "bg-platoon-10" }, // lilac
] as const;

export const PALETTE_SIZE = PALETTE.length;

export function platoonColor(color: number) {
  return PALETTE[((color % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** The color for a new platoon: the least-used one, so neighbours differ. */
export function nextColor(used: number[]) {
  const counts = Array.from({ length: PALETTE.length }, (_, i) => used.filter((c) => c % PALETTE.length === i).length);
  return counts.indexOf(Math.min(...counts));
}

function normalize(s: string) {
  return s
    .replace(/["'״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Match free text (from a pasted roster, e.g. "1", "מחלקה 2", "צוות 3", "מפלג") to one of the
 * company's platoons. Exact name first, then a bare number against the number in a name
 * ("2" → "מחלקה 2" / "צוות 2"), then an HQ alias against an HQ-like name. Null when nothing fits
 * or the match is ambiguous.
 */
export function matchPlatoon<P extends { name: string }>(raw: string | undefined, platoons: P[]): P | null {
  if (!raw) return null;
  const v = normalize(raw);
  if (!v) return null;
  const exact = platoons.filter((p) => normalize(p.name) === v);
  if (exact.length === 1) return exact[0];

  const num = v.match(/^(?:\D*?\s)?(\d+)$/)?.[1];
  if (num) {
    const byNumber = platoons.filter((p) => normalize(p.name).match(/(\d+)$/)?.[1] === num);
    if (byNumber.length === 1) return byNumber[0];
  }

  const HQ = /חפק|מפלג|פלג|מפקדה|hq/;
  if (HQ.test(v)) {
    const hq = platoons.filter((p) => HQ.test(normalize(p.name)));
    if (hq.length === 1) return hq[0];
  }
  const contains = platoons.filter((p) => normalize(p.name).includes(v) || v.includes(normalize(p.name)));
  return contains.length === 1 ? contains[0] : null;
}

/** Default platoons for a new company — renamed / extended by its admin on /platoons. */
export const DEFAULT_PLATOONS = ["מחלקה 1", "מחלקה 2", "מחלקה 3", 'חפ"ק ומפל"ג'];
