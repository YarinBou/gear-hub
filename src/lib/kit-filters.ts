import type { KitTile } from "@/lib/queries/kits";

// The kits grid's filters (/kits?platoon=…&filter=…&pakal=…). Shared with the kit page, so its
// ‹ › arrows walk through the same kits the grid shows.

export type KitFilter = "missing" | "unissued" | "unsigned" | "checked" | "unchecked" | "partialSign";

export const partialSign = (k: KitTile) => !!k.coverage && k.coverage.signed < k.coverage.total;

export const KIT_FILTERS: Record<KitFilter, { label: string; test: (k: KitTile) => boolean }> = {
  missing: { label: "חסרים פריטים", test: (k) => !!k.soldier && k.readiness < 100 },
  unsigned: { label: "לא הוחתמו", test: (k) => !!k.soldier && !k.signedAt },
  partialSign: { label: "חתימה חלקית", test: partialSign },
  unissued: { label: "לא הונפקו", test: (k) => !k.soldier },
  checked: { label: "נבדקו", test: (k) => k.stock?.state === "checked" },
  unchecked: { label: "במלאי — לא נבדקו", test: (k) => !!k.stock && k.stock.state !== "checked" },
};

/** The grid's current view: platoon id, status filter, פק"ל id or "any". */
export type KitView = { platoon?: string; filter?: KitFilter; pakal?: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Read the view from search params (platoon is checked against the company's platoons by the caller). */
export function parseKitView(sp: Record<string, string | string[] | undefined>): KitView {
  const filterRaw = first(sp.filter);
  return {
    platoon: first(sp.platoon) || undefined,
    filter: filterRaw && filterRaw in KIT_FILTERS ? (filterRaw as KitFilter) : undefined,
    pakal: first(sp.pakal) || undefined,
  };
}

/** The kits the view shows. */
export function applyKitView(kits: KitTile[], view: KitView) {
  return kits
    .filter((k) => !view.platoon || k.soldier?.platoon.id === view.platoon)
    .filter((k) => !view.filter || KIT_FILTERS[view.filter].test(k))
    .filter((k) => !view.pakal || (view.pakal === "any" ? !!k.pakal : k.pakal?.id === view.pakal));
}

/** "?platoon=…&filter=…&pakal=…" (or "") — carried on kit links so the kit page keeps the view. */
export function kitViewQuery(view: KitView) {
  const q = new URLSearchParams();
  if (view.platoon) q.set("platoon", view.platoon);
  if (view.filter) q.set("filter", view.filter);
  if (view.pakal) q.set("pakal", view.pakal);
  const s = q.toString();
  return s ? `?${s}` : "";
}
