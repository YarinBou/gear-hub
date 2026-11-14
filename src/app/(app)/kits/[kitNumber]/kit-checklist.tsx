"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, CheckCheck, ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { KIT_GROUP_LABELS, KIT_ITEMS, type KitBooleanKey, type KitGroup } from "@/lib/kit";
import { cn } from "@/lib/utils";
import { completeInspection, setAllKitItems, setKitItem } from "../actions";

type Checklist = Record<KitBooleanKey, boolean>;
type Patch = { key: KitBooleanKey | "*"; value: boolean };

const GROUPS: KitGroup[] = ["weapon", "accessories", "personal"];

/**
 * Inspection checklist. Every tap saves immediately (optimistic), so an inspector can
 * walk down the list with one thumb and never press "save".
 */
export function KitChecklist({
  kitNumber,
  checklist,
  issued,
}: {
  kitNumber: number;
  checklist: Checklist;
  issued: boolean;
}) {
  const [optimistic, apply] = useOptimistic(checklist, (state: Checklist, p: Patch) =>
    p.key === "*"
      ? (Object.fromEntries(Object.keys(state).map((k) => [k, p.value])) as Checklist)
      : { ...state, [p.key]: p.value },
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [inspecting, startInspection] = useTransition();
  const [inspectionMsg, setInspectionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const total = KIT_ITEMS.length;
  const present = KIT_ITEMS.filter((i) => optimistic[i.key]).length;
  const pct = Math.round((present / total) * 100);

  const toggle = (key: KitBooleanKey) => {
    const value = !optimistic[key];
    setError(null);
    startTransition(async () => {
      apply({ key, value });
      const r = await setKitItem(kitNumber, key, value);
      if (!r.ok) setError(r.message ?? "השמירה נכשלה");
    });
  };
  const allPresent = () =>
    startTransition(async () => {
      apply({ key: "*", value: true });
      const r = await setAllKitItems(kitNumber, true);
      if (!r.ok) setError(r.message ?? "השמירה נכשלה");
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Progress
          value={pct}
          className="h-3"
          indicatorClassName={pct === 100 ? "bg-success" : pct >= 75 ? "bg-warning" : "bg-danger"}
        />
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {present}/{total}
        </span>
      </div>

      {GROUPS.map((g) => {
        const items = KIT_ITEMS.filter((i) => i.group === g);
        return (
          <section key={g}>
            <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
              {KIT_GROUP_LABELS[g]} ({items.filter((i) => optimistic[i.key]).length}/{items.length})
            </h3>
            <ul className="divide-y rounded-lg border">
              {items.map((item) => {
                const on = optimistic[item.key];
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(item.key)}
                      className="active:bg-accent flex min-h-12 w-full items-center gap-3 px-3 text-start"
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                          on ? "bg-success text-success-foreground" : "bg-danger/15 text-danger",
                        )}
                      >
                        {on ? <Check className="size-4" /> : <X className="size-4" />}
                      </span>
                      <span className={cn("flex-1 font-medium", !on && "text-danger")}>{item.label}</span>
                      <span className={cn("text-xs font-medium", on ? "text-success" : "text-danger")}>
                        {on ? "קיים" : "חסר"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <Button type="button" variant="outline" onClick={allPresent} disabled={present === total}>
          <CheckCheck />
          סימון הכל כקיים
        </Button>
        {issued && (
          <>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הערה למסדר (אופציונלי)"
              aria-label="הערה למסדר"
            />
            <Button
              type="button"
              size="lg"
              disabled={inspecting}
              onClick={() =>
                startInspection(async () => {
                  const r = await completeInspection(kitNumber, note);
                  setInspectionMsg({ ok: r.ok, text: r.message ?? "" });
                  if (r.ok) setNote("");
                })
              }
            >
              <ClipboardCheck />
              {inspecting ? "רושם…" : "סיום מסדר לערכה"}
            </Button>
            {inspectionMsg && (
              <p role="status" className={cn("text-sm font-medium", inspectionMsg.ok ? "text-success" : "text-danger")}>
                {inspectionMsg.text}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
