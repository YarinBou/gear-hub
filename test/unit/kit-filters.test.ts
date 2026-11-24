import { describe, expect, it } from "vitest";
import { applyKitView, kitViewQuery, parseKitView } from "@/lib/kit-filters";
import type { KitTile } from "@/lib/queries/kits";

const tile = (kitNumber: number, over: Partial<KitTile> = {}): KitTile => ({
  kitNumber,
  pakal: null,
  soldier: null,
  readiness: 0,
  missing: [],
  signedAt: null,
  lastInspectedAt: null,
  stock: { state: "unchecked", checkedAt: null },
  coverage: null,
  ...over,
});

describe("kit grid view (filters shared with the kit page arrows)", () => {
  const kits = [
    tile(1, { stock: { state: "checked", checkedAt: new Date() } }),
    tile(2),
    tile(3, { stock: { state: "checked", checkedAt: new Date() }, pakal: { id: "p", name: "נגביסט", color: 0 } }),
    tile(4, { pakal: { id: "p", name: "נגביסט", color: 0 } }),
  ];
  it("applies the status filter and the פק\"ל filter together", () => {
    expect(applyKitView(kits, { filter: "checked" }).map((k) => k.kitNumber)).toEqual([1, 3]);
    expect(applyKitView(kits, { pakal: "any" }).map((k) => k.kitNumber)).toEqual([3, 4]);
    expect(applyKitView(kits, { filter: "checked", pakal: "p" }).map((k) => k.kitNumber)).toEqual([3]);
  });
  it("round-trips through the URL; an unknown filter is dropped", () => {
    const view = parseKitView({ filter: "checked", pakal: "p", platoon: "x" });
    expect(view).toEqual({ filter: "checked", pakal: "p", platoon: "x" });
    expect(kitViewQuery(view)).toBe("?platoon=x&filter=checked&pakal=p");
    expect(parseKitView({ filter: "nope" }).filter).toBeUndefined();
    expect(kitViewQuery({})).toBe("");
  });
});
