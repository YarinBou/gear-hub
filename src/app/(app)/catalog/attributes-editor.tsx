"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ATTRIBUTE_PRESETS, MAX_ATTRIBUTES, type AttributeDef } from "@/lib/equipment-attributes";

/** A short stable key for a new property (kept when it's renamed, so item values stay attached). */
function newKey() {
  return `a${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * מאפיינים of an equipment type, edited inside its catalog form and sent as JSON in a hidden
 * "attributes" field: yes / no checks (קייס, שלט PTT, מתאם לקסדה) or a choice (צבע: חום / שחור).
 */
export function AttributesEditor({ initial }: { initial: AttributeDef[] }) {
  const [defs, setDefs] = useState<AttributeDef[]>(initial);
  const used = new Set(defs.map((d) => d.label));
  const update = (i: number, d: AttributeDef) => setDefs(defs.map((x, j) => (j === i ? d : x)));

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <input type="hidden" name="attributes" value={JSON.stringify(defs)} />
      <p className="text-sm font-medium">מאפיינים לכל פריט מסוג זה</p>
      <p className="text-muted-foreground -mt-1 text-xs">
        יש / אין (למשל קייס, שלט PTT, מתאם לקסדה) או בחירה מרשימה (למשל צבע: חום / שחור). מסמנים אותם על כל פריט.
      </p>
      {defs.map((d, i) => (
        <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Input
            aria-label="שם המאפיין"
            value={d.label}
            onChange={(e) => update(i, { ...d, label: e.target.value })}
            className="h-9 w-36"
            maxLength={30}
          />
          {d.kind === "check" ? (
            <span className="text-muted-foreground text-xs">יש / אין</span>
          ) : (
            <Input
              aria-label={`אפשרויות ל${d.label} (מופרדות בפסיק)`}
              value={d.options.join(", ")}
              onChange={(e) => update(i, { ...d, options: e.target.value.split(",").map((o) => o.trim()) })}
              className="h-9 min-w-0 flex-1"
              placeholder="אפשרויות, מופרדות בפסיק"
            />
          )}
          <Button type="button" variant="ghost" size="icon" aria-label={`הסרת ${d.label}`} onClick={() => setDefs(defs.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      {defs.length < MAX_ATTRIBUTES && (
        <div className="flex flex-wrap gap-1.5">
          {ATTRIBUTE_PRESETS.filter((p) => !used.has(p.label)).map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setDefs([...defs, { ...p, key: newKey() } as AttributeDef])}>
              <Plus />
              {p.label}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setDefs([...defs, { key: newKey(), label: "", kind: "check" }])}>
            <Plus />
            יש / אין אחר
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDefs([...defs, { key: newKey(), label: "", kind: "choice", options: [] }])}
          >
            <Plus />
            בחירה מרשימה
          </Button>
        </div>
      )}
    </div>
  );
}
