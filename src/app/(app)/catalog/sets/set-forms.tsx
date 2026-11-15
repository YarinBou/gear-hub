"use client";

import { useState, useTransition } from "react";
import { Boxes, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SetRow } from "@/lib/queries/sets";
import { deleteSet, saveSet, setSetActive, type SetResult } from "./actions";

type Category = { id: string; name: string };
type Slot = { key: number; categoryId: string; quantity: string; required: boolean };
type Draft = { name: string; mainCategoryId: string; notes: string; slots: Slot[] };

let nextKey = 1;
const newSlot = (s: Partial<Slot> = {}): Slot => ({ key: nextKey++, categoryId: "", quantity: "1", required: true, ...s });

function draftOf(set?: SetRow): Draft {
  if (!set) return { name: "", mainCategoryId: "", notes: "", slots: [newSlot()] };
  return {
    name: set.name,
    mainCategoryId: set.mainCategoryId,
    notes: set.notes ?? "",
    slots: set.slots.map((s) => newSlot({ categoryId: s.categoryId, quantity: String(s.quantity), required: s.required })),
  };
}

/** The editor used for both "new set" and "edit set". */
function SetEditor({
  initial,
  categories,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  categories: Category[];
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<SetResult>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [result, setResult] = useState<SetResult | null>(null);
  const [pending, start] = useTransition();
  const errors = result?.errors ?? {};
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateSlot = (key: number, patch: Partial<Slot>) =>
    setDraft((d) => ({ ...d, slots: d.slots.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSubmit(draft);
          setResult(r);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="set-name" label="שם המארז" error={errors.name} required>
          <Input
            id="set-name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="למשל: מארז נגב, ערכת קלע"
            autoComplete="off"
            aria-invalid={!!errors.name}
          />
        </Field>
        <Field id="set-main" label="פריט ראשי" error={errors.mainCategoryId} required hint="הפריט שאליו נקשרים הרכיבים">
          <Select
            id="set-main"
            value={draft.mainCategoryId}
            onChange={(e) => update({ mainCategoryId: e.target.value })}
            aria-invalid={!!errors.mainCategoryId}
          >
            <option value="">בחירת סוג…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">רכיבים</legend>
        {draft.slots.map((s, i) => (
          <div key={s.key} className="bg-muted/40 grid grid-cols-[1fr_5rem_auto] items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
            <Select
              aria-label={`רכיב ${i + 1}`}
              value={s.categoryId}
              onChange={(e) => updateSlot(s.key, { categoryId: e.target.value })}
            >
              <option value="">בחירת סוג…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              aria-label={`כמות רכיב ${i + 1}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={s.quantity}
              onChange={(e) => updateSlot(s.key, { quantity: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`הסרת רכיב ${i + 1}`}
              className="sm:order-last"
              disabled={draft.slots.length === 1}
              onClick={() => update({ slots: draft.slots.filter((x) => x.key !== s.key) })}
            >
              <X />
            </Button>
            <div className="bg-background col-span-3 flex rounded-md border p-0.5 text-sm sm:col-span-1">
              {[
                { v: true, label: "חובה" },
                { v: false, label: "תוספת" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={s.required === o.v}
                  onClick={() => updateSlot(s.key, { required: o.v })}
                  className={cn(
                    "h-9 flex-1 rounded px-2 font-medium transition-colors",
                    s.required === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {errors.slots && <p className="text-danger text-sm">{errors.slots}</p>}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => update({ slots: [...draft.slots, newSlot()] })}>
          <Plus />
          רכיב נוסף
        </Button>
      </fieldset>

      <Field id="set-notes" label="הערות" error={errors.notes}>
        <Input
          id="set-notes"
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="למשל: למקלעני מחלקה 2"
          autoComplete="off"
        />
      </Field>

      {result?.message && <p className={result.ok ? "text-success text-sm font-medium" : "text-danger text-sm"}>{result.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

function toInput(d: Draft) {
  return {
    name: d.name,
    mainCategoryId: d.mainCategoryId,
    notes: d.notes,
    // Empty lines are ignored rather than reported.
    slots: d.slots.filter((s) => s.categoryId).map((s) => ({ categoryId: s.categoryId, quantity: s.quantity, required: s.required })),
  };
}

export function AddSetForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      {message && <p className="text-success text-sm font-medium">{message}</p>}
      {!open ? (
        <Button className="sm:w-fit" onClick={() => setOpen(true)}>
          <Plus />
          הגדרת מארז חדש
        </Button>
      ) : (
        <Card>
          <CardContent>
            <SetEditor
              key={round}
              initial={draftOf()}
              categories={categories}
              submitLabel="הוספת מארז"
              onCancel={() => setOpen(false)}
              onSubmit={async (d) => {
                const r = await saveSet(null, toInput(d));
                if (r.ok) {
                  setMessage(r.message ?? null);
                  setOpen(false);
                  setRound((n) => n + 1);
                }
                return r;
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function SetCard({ set, categories }: { set: SetRow; categories: Category[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Types that were deactivated in the catalog must stay selectable for sets that use them.
  const known = new Set(categories.map((c) => c.id));
  const extra = [
    { id: set.mainCategoryId, name: set.mainCategory.name },
    ...set.slots.map((s) => ({ id: s.categoryId, name: s.category.name })),
  ].filter((c, i, all) => !known.has(c.id) && all.findIndex((x) => x.id === c.id) === i);
  const options = [...categories, ...extra];

  return (
    <Card className={cn("gap-3", !set.isActive && "opacity-70")}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              <Boxes className="text-muted-foreground size-4" />
              {set.name}
              {!set.isActive && <Badge variant="secondary">מושבת</Badge>}
            </h2>
            <p className="text-muted-foreground text-sm">
              פריט ראשי: <span className="text-foreground font-medium">{set.mainCategory.name}</span>
              {set._count.items > 0 && ` · ${set._count.items} פריטים הוחתמו במארז זה`}
            </p>
            {set.notes && <p className="text-muted-foreground text-sm">{set.notes}</p>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil />
              עריכה
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => start(async () => void (await setSetActive(set.id, !set.isActive)))}
            >
              <Power />
              {set.isActive ? "השבתה" : "הפעלה"}
            </Button>
            {set._count.items === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`למחוק את המארז "${set.name}"?`)) return;
                  start(async () => {
                    const r = await deleteSet(set.id);
                    setError(r.ok ? null : (r.message ?? "שגיאה"));
                  });
                }}
              >
                <Trash2 />
                מחיקה
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}

        {editing ? (
          <div className="bg-muted/30 rounded-lg border p-3">
            <SetEditor
              initial={draftOf(set)}
              categories={options}
              submitLabel="שמירה"
              onCancel={() => setEditing(false)}
              onSubmit={async (d) => {
                const r = await saveSet(set.id, toInput(d));
                if (r.ok) setEditing(false);
                return r;
              }}
            />
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {set.slots.map((s) => (
              <li key={s.id}>
                <Badge variant={s.required ? "outline" : "secondary"} className="h-7 px-2.5 text-sm">
                  {s.category.name}
                  {s.quantity > 1 && <span className="tabular-nums">×{s.quantity}</span>}
                  {!s.required && <span className="text-muted-foreground text-xs">(תוספת)</span>}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
