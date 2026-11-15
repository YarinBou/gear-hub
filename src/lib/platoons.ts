// Platoons (מחלקות) are per-company rows managed by admins on /platoons — any number, any names.
// Pure helpers shared by server and client code.

/** What the UI needs to show a platoon. Select it with `platoon: platoonSelect`. */
export type PlatoonRef = { id: string; name: string; color: number };

export const platoonSelect = { select: { id: true, name: true, color: true } } as const;

/**
 * Badge palette. A platoon keeps the color it got when it was created (`Platoon.color`), so colors
 * don't shift when platoons are reordered. The first four match the company's old Excel report
 * (1 = pink, 2 = blue, 3 = green, HQ = amber). Full class strings so Tailwind sees them at build time.
 */
const PALETTE = [
  { badge: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200", dot: "bg-rose-500" },
  { badge: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200", dot: "bg-sky-500" },
  { badge: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", dot: "bg-emerald-500" },
  { badge: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200", dot: "bg-amber-500" },
  { badge: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200", dot: "bg-violet-500" },
  { badge: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200", dot: "bg-teal-500" },
  { badge: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200", dot: "bg-orange-500" },
  { badge: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200", dot: "bg-fuchsia-500" },
  { badge: "border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-900 dark:bg-lime-950 dark:text-lime-200", dot: "bg-lime-500" },
  { badge: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200", dot: "bg-indigo-500" },
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
