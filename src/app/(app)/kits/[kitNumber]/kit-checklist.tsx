"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, CheckCheck, ClipboardCheck, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { groupLines, kitReadiness, lineComplete, type ChecklistLine } from "@/lib/kit";
import { cn } from "@/lib/utils";
import { completeInspection, setAllKitItems, setKitItem, setKitItemQuantity } from "../actions";

type Patch = { itemId: string | "*"; present?: boolean; quantity?: number };

/**
 * Inspection checklist (the company's own list — see /kits/items). Every tap saves immediately
 * (optimistic), so an inspector can walk down the list with one thumb and never press "save".
 * Counted items (e.g. magazines) get − / + instead of a toggle.
 */
export function KitChecklist({ kitNumber, lines, issued }: { kitNumber: number; lines: ChecklistLine[]; issued: boolean }) {
  const [optimistic, apply] = useOptimistic(lines, (state: ChecklistLine[], p: Patch) =>
    state.map((l) => {
      if (p.itemId === "*") return { ...l, present: true, quantity: l.targetQuantity ?? l.quantity };
      if (l.itemId !== p.itemId) return l;
      return { ...l, ...(p.present !== undefined ? { present: p.present } : {}), ...(p.quantity !== undefined ? { quantity: p.quantity } : {}) };
    }),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [inspecting, startInspection] = useTransition();
  const [inspectionMsg, setInspectionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const total = optimistic.length;
  const complete = optimistic.filter(lineComplete).length;
  const pct = kitReadiness(optimistic);

  const save = (patch: Patch, run: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      apply(patch);
      const r = await run();
      if (!r.ok) setError(r.message ?? "השמירה נכשלה");
    });
  };
  const toggle = (line: ChecklistLine) =>
    save({ itemId: line.itemId, present: !line.present }, () => setKitItem(kitNumber, line.itemId, !line.present));
  const setQuantity = (line: ChecklistLine, quantity: number) =>
    save({ itemId: line.itemId, quantity }, () => setKitItemQuantity(kitNumber, line.itemId, quantity));
  const allPresent = () => save({ itemId: "*" }, () => setAllKitItems(kitNumber));

  if (!total) {
    return <p className="text-muted-foreground text-sm">לפלוגה עדיין אין רשימת ציוד לערכה. מנהל יכול להגדיר אותה במסך &quot;תכולת ערכה&quot;.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Progress
          value={pct}
          className="h-3"
          indicatorClassName={pct === 100 ? "bg-success" : pct >= 75 ? "bg-warning" : "bg-danger"}
        />
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {complete}/{total}
        </span>
      </div>

      {groupLines(optimistic).map((g) => (
        <section key={g.groupName}>
          <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
            {g.groupName} ({g.lines.filter(lineComplete).length}/{g.lines.length})
          </h3>
          <ul className="divide-y rounded-lg border">
            {g.lines.map((line) => (
              <li key={line.itemId}>
                {line.targetQuantity != null ? (
                  <QuantityRow line={line} onChange={(q) => setQuantity(line, q)} />
                ) : (
                  <ToggleRow line={line} onToggle={() => toggle(line)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <Button type="button" variant="outline" onClick={allPresent} disabled={complete === total}>
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

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
        on ? "bg-success text-success-foreground" : "bg-danger/15 text-danger",
      )}
    >
      {on ? <Check className="size-4" /> : <X className="size-4" />}
    </span>
  );
}

function ToggleRow({ line, onToggle }: { line: ChecklistLine; onToggle: () => void }) {
  const on = line.present;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="active:bg-accent flex min-h-12 w-full items-center gap-3 px-3 text-start"
    >
      <StatusDot on={on} />
      <span className={cn("flex-1 font-medium", !on && "text-danger")}>{line.label}</span>
      <span className={cn("text-xs font-medium", on ? "text-success" : "text-danger")}>{on ? "קיים" : "חסר"}</span>
    </button>
  );
}

function QuantityRow({ line, onChange }: { line: ChecklistLine; onChange: (quantity: number) => void }) {
  const qty = line.quantity ?? 0;
  const target = line.targetQuantity ?? 0;
  const ok = qty >= target;
  return (
    <div className="flex min-h-12 items-center gap-3 px-3" role="group" aria-label={line.label}>
      <StatusDot on={ok} />
      <span className={cn("flex-1 font-medium", !ok && "text-danger")}>{line.label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" aria-label={`פחות ${line.label}`} disabled={qty <= 0} onClick={() => onChange(qty - 1)}>
          <Minus />
        </Button>
        <span className={cn("w-14 text-center text-sm font-semibold tabular-nums", ok ? "text-success" : "text-danger")}>
          {qty}/{target}
        </span>
        <Button type="button" variant="outline" size="icon" aria-label={`עוד ${line.label}`} onClick={() => onChange(qty + 1)}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
