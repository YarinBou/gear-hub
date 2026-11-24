"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, CheckCheck, ClipboardCheck, Minus, PenLine, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { expectedOf, groupLines, haveOf, kitReadiness, lineApplies, lineComplete, type ChecklistLine } from "@/lib/kit";
import { cn } from "@/lib/utils";
import { completeContentsCheck, completeInspection, setAllKitItems, setKitBaseline, setKitItem, setKitItemQuantity } from "../actions";

type Patch = { itemId: string | "*"; present?: boolean; quantity?: number; baseline?: number | null };

/**
 * Inspection checklist (the company's own list — see /kits/items). Every tap saves immediately
 * (optimistic), so an inspector can walk down the list with one thumb and never press "save".
 * Counted items (e.g. magazines) get − / + instead of a toggle.
 *
 * Once the soldier has signed, only what they signed for counts: lines they didn't sign for sit in
 * a separate "not part of this kit" list and are never missing. "עריכת מה שנחתם" corrects that.
 */
export function KitChecklist({
  kitNumber,
  lines,
  issued,
  canCheck = false,
  checkedAt = null,
  signed = false,
}: {
  kitNumber: number;
  lines: ChecklistLine[];
  issued: boolean;
  /** A kit in stock in the active deployment: offer the contents check. */
  canCheck?: boolean;
  /** When its contents were last checked (null = never). */
  checkedAt?: Date | null;
  /** Whether the soldier has signed (what they signed for is then fixed). */
  signed?: boolean;
}) {
  const [optimistic, apply] = useOptimistic(lines, (state: ChecklistLine[], p: Patch) =>
    state.map((l) => {
      if (p.itemId === "*") {
        const expected = expectedOf(l);
        if (expected == null) return l;
        return l.targetQuantity != null ? { ...l, quantity: expected } : { ...l, present: true };
      }
      if (l.itemId !== p.itemId) return l;
      return {
        ...l,
        ...(p.present !== undefined ? { present: p.present } : {}),
        ...(p.quantity !== undefined ? { quantity: p.quantity } : {}),
        ...(p.baseline !== undefined ? { baseline: p.baseline } : {}),
      };
    }),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [inspecting, startInspection] = useTransition();
  const [inspectionMsg, setInspectionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const applicable = optimistic.filter(lineApplies);
  const hasBaseline = optimistic.some((l) => l.baseline != null);
  const total = applicable.length;
  const complete = applicable.filter(lineComplete).length;
  const pct = kitReadiness(optimistic);

  const save = (patch: Patch, run: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      apply(patch);
      const r = await run();
      if (!r.ok) setError(r.message ?? "השמירה נכשלה");
    });
  };
  // A line that isn't part of the kit joins it when something is marked as there (the server records
  // it as signed for at that amount); the optimistic patch moves it up right away.
  // Unsigned kit: an optional line follows what's in the bag (like the server does).
  const joins = (line: ChecklistLine, have: number) =>
    line.optional && !signed ? { baseline: have > 0 ? have : null } : !lineApplies(line) && have > 0 ? { baseline: have } : {};
  const toggle = (line: ChecklistLine) =>
    save({ itemId: line.itemId, present: !line.present, ...joins(line, line.present ? 0 : 1) }, () =>
      setKitItem(kitNumber, line.itemId, !line.present),
    );
  /** A present / missing line outside the kit: found in the bag → it joins the kit, as present. */
  const addToKit = (line: ChecklistLine) =>
    save({ itemId: line.itemId, present: true, baseline: 1 }, () => setKitItem(kitNumber, line.itemId, true));
  const setQuantity = (line: ChecklistLine, quantity: number) =>
    save({ itemId: line.itemId, quantity, ...joins(line, quantity) }, () => setKitItemQuantity(kitNumber, line.itemId, quantity));
  const setBaseline = (line: ChecklistLine, baseline: number) =>
    save({ itemId: line.itemId, baseline }, () => setKitBaseline(kitNumber, line.itemId, baseline));
  const allPresent = () => save({ itemId: "*" }, () => setAllKitItems(kitNumber));

  if (!optimistic.length) {
    return <p className="text-muted-foreground text-sm">לפלוגה עדיין אין רשימת ציוד לערכה. מנהל יכול להגדיר אותה במסך &quot;תכולת ערכה&quot;.</p>;
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-muted rounded-lg p-3 text-sm">
          <p className="font-medium">עריכת מה שהלוחם חתם עליו</p>
          <p className="text-muted-foreground">
            פריט שלא נחתם לא ייחשב כחוסר. בפריטים לפי כמות, הכמות שנחתמה היא מה שנבדק במסדר (0 = לא שייך לתיק).
          </p>
        </div>
        {groupLines(optimistic).map((g) => (
          <section key={g.groupName}>
            <h3 className="text-muted-foreground mb-1 text-xs font-semibold">{g.groupName}</h3>
            <ul className="divide-y rounded-lg border">
              {g.lines.map((line) => (
                <li key={line.itemId}>
                  <BaselineRow line={line} onChange={(b) => setBaseline(line, b)} />
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
        <Button type="button" onClick={() => setEditing(false)}>
          <Check />
          סיום עריכה
        </Button>
      </div>
    );
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
      {hasBaseline && <p className="text-muted-foreground -mt-2 text-xs">חוסרים נבדקים מול מה שהלוחם חתם עליו</p>}

      {/* Each group lists its kit lines, then — muted, with + / − — items that aren't part of this kit
          (optional ones like drums, or not signed for). Adding one puts it in the kit. */}
      {groupLines(optimistic).map((g) => {
        const mine = g.lines.filter(lineApplies);
        const extra = g.lines.filter((l) => !lineApplies(l));
        return (
          <section key={g.groupName}>
            <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
              {g.groupName} {mine.length > 0 && `(${mine.filter(lineComplete).length}/${mine.length})`}
            </h3>
            <ul className="divide-y rounded-lg border">
              {mine.map((line) => (
                <li key={line.itemId}>
                  {line.targetQuantity != null ? (
                    <QuantityRow line={line} onChange={(q) => setQuantity(line, q)} />
                  ) : (
                    <ToggleRow line={line} onToggle={() => toggle(line)} />
                  )}
                </li>
              ))}
              {extra.map((l) => (
                <li key={l.itemId} className="bg-muted/30">
                  {l.targetQuantity != null ? (
                    <div className="flex min-h-12 items-center gap-3 px-3" role="group" aria-label={l.label}>
                      <span className="text-muted-foreground flex-1">
                        {l.label} <span className="text-xs">· לא בתיק</span>
                      </span>
                      <Stepper label={l.label} value={haveOf(l)} onChange={(q) => setQuantity(l, q)} display={String(haveOf(l))} tone="" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToKit(l)}
                      className="active:bg-accent flex min-h-12 w-full items-center gap-3 px-3 text-start"
                    >
                      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                        <Plus className="size-4" />
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {l.label} <span className="text-xs">· לא בתיק</span>
                      </span>
                      <span className="text-muted-foreground text-xs">הוספה לתיק</span>
                    </button>
                  )}
                </li>
              ))}
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
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <PenLine />
              עריכת מה שהלוחם חתם עליו
            </Button>
          </>
        )}
        {!issued && canCheck && (
          <>
            <p className="text-muted-foreground text-xs">
              בדיקת תכולה: עוברים על כל הפריטים — כולל אלה שמסומנים &quot;לא בתיק&quot; — ומסמנים מה יש בתיק בפועל. אחרי האישור התיק מסומן
              כנבדק, והתכולה שלו נשמרת גם להפעלה הבאה.
            </p>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה לבדיקה (אופציונלי)" aria-label="הערה לבדיקת התכולה" />
            <Button
              type="button"
              size="lg"
              disabled={inspecting}
              onClick={() =>
                startInspection(async () => {
                  const r = await completeContentsCheck(kitNumber, note);
                  setInspectionMsg({ ok: r.ok, text: r.message ?? "" });
                  if (r.ok) setNote("");
                })
              }
            >
              <ClipboardCheck />
              {inspecting ? "רושם…" : checkedAt ? "בדיקת תכולה חוזרת" : "סיום בדיקת תכולה"}
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
  const target = expectedOf(line) ?? 0;
  const ok = qty >= target;
  return (
    <div className="flex min-h-12 items-center gap-3 px-3" role="group" aria-label={line.label}>
      <StatusDot on={ok} />
      <span className={cn("flex-1 font-medium", !ok && "text-danger")}>{line.label}</span>
      <Stepper label={line.label} value={qty} onChange={onChange} display={`${qty}/${target}`} tone={ok ? "text-success" : "text-danger"} />
    </div>
  );
}

/** Edit mode: what the soldier signed for on this line. */
function BaselineRow({ line, onChange }: { line: ChecklistLine; onChange: (baseline: number) => void }) {
  const signed = expectedOf(line) ?? 0;
  if (line.targetQuantity == null) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={signed > 0}
        onClick={() => onChange(signed > 0 ? 0 : 1)}
        className="active:bg-accent flex min-h-12 w-full items-center gap-3 px-3 text-start"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            signed > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {signed > 0 ? <Check className="size-4" /> : <Minus className="size-4" />}
        </span>
        <span className={cn("flex-1 font-medium", signed === 0 && "text-muted-foreground")}>{line.label}</span>
        <span className="text-muted-foreground text-xs">{signed > 0 ? "חתום" : "לא שייך"}</span>
      </button>
    );
  }
  return (
    <div className="flex min-h-12 items-center gap-3 px-3" role="group" aria-label={`${line.label} — כמות שנחתמה`}>
      <span className={cn("flex-1 font-medium", signed === 0 && "text-muted-foreground")}>{line.label}</span>
      <Stepper
        label={`${line.label} שנחתמו`}
        value={signed}
        onChange={onChange}
        display={signed === 0 ? "לא שייך" : String(signed)}
        tone={signed === 0 ? "text-muted-foreground" : ""}
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  display,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  display: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" aria-label={`פחות ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <Minus />
      </Button>
      <span className={cn("w-16 text-center text-sm font-semibold tabular-nums", tone)}>{display}</span>
      <Button type="button" variant="outline" size="icon" aria-label={`עוד ${label}`} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
  );
}
