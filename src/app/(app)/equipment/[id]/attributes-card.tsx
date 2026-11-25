"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_COUNT, type AttributeDef, type AttributeValues } from "@/lib/equipment-attributes";
import { setItemAttributes } from "../actions";

/**
 * מאפיינים of this item (as defined for its type): yes / no toggles and choices. Each change saves at
 * once and is written to the item's history.
 */
export function ItemAttributes({ itemId, defs, values }: { itemId: string; defs: AttributeDef[]; values: AttributeValues }) {
  const [current, setCurrent] = useState(values);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (key: string, value: boolean | string | number | null) => {
    const prev = current;
    const next = { ...current };
    if (value === null) delete next[key];
    else next[key] = value;
    setCurrent(next);
    setError(null);
    start(async () => {
      const r = await setItemAttributes(itemId, { [key]: value });
      if (!r.ok) {
        setCurrent(prev);
        setError(r.message ?? "השמירה נכשלה");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y">
        {defs.map((d) => {
          const v = current[d.key];
          return (
            <li key={d.key} className="flex min-h-12 flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 font-medium">{d.label}</span>
              {d.kind === "check" ? (
                <div role="radiogroup" aria-label={d.label} className="bg-muted flex rounded-lg p-1">
                  {[
                    { on: true, label: "יש" },
                    { on: false, label: "אין" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={v === o.on}
                      disabled={pending}
                      onClick={() => save(d.key, v === o.on ? null : o.on)}
                      className={cn(
                        "flex h-9 min-w-16 items-center justify-center gap-1 rounded-md px-3 text-sm font-medium",
                        v === o.on ? (o.on ? "bg-success/15 text-success" : "bg-danger/15 text-danger") : "text-muted-foreground",
                      )}
                    >
                      {o.on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : d.kind === "count" ? (
                <div className="flex items-center gap-1" role="group" aria-label={d.label}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`פחות ${d.label}`}
                    disabled={pending || v === undefined || v === 0}
                    onClick={() => save(d.key, Math.max(0, Number(v) - 1))}
                  >
                    <Minus />
                  </Button>
                  <span className={cn("w-12 text-center font-semibold tabular-nums", !v && "text-danger")}>
                    {v === undefined ? "—" : String(v)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`עוד ${d.label}`}
                    disabled={pending || Number(v ?? 0) >= MAX_COUNT}
                    onClick={() => save(d.key, Number(v ?? 0) + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              ) : (
                <div role="radiogroup" aria-label={d.label} className="bg-muted flex flex-wrap rounded-lg p-1">
                  {d.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={v === o}
                      disabled={pending}
                      onClick={() => save(d.key, v === o ? null : o)}
                      className={cn(
                        "flex h-9 min-w-16 items-center justify-center rounded-md px-3 text-sm font-medium",
                        v === o ? "bg-card shadow-xs" : "text-muted-foreground",
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
