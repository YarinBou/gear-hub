"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AMMO_LOG_LABELS } from "@/lib/ammo-rules";
import { cn, formatDateTime, formatDaysAgo, formatNumber } from "@/lib/utils";
import type { AmmoLogType } from "@/generated/prisma/enums";
import type { AmmoStockRow } from "@/lib/queries/ammo";
import { addStock, deleteStock, recordMovement } from "./actions";

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Success({ message }: { message?: string }) {
  return (
    <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
      <CheckCircle2 className="size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

// ───────────── Add location ─────────────

export function AddStockForm({
  categories,
  locations,
  defaultCategoryId,
}: {
  categories: { id: string; name: string }[];
  locations: string[];
  defaultCategoryId?: string;
}) {
  const [open, setOpen] = useState(!!defaultCategoryId);
  const [state, action, pending] = useActionState(addStock, undefined);
  const err = state?.errors ?? {};

  if (!open)
    return (
      <div className="flex flex-col gap-2">
        {state?.ok && <Success message={state.message} />}
        <Button onClick={() => setOpen(true)} className="sm:w-fit">
          <Plus />
          פתיחת מיקום מלאי
        </Button>
      </div>
    );

  return (
    <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="bg-card flex flex-col gap-4 rounded-xl border p-4" noValidate>
      {state?.ok && <Success message={state.message} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="add-categoryId" label="סוג תחמושת" error={err.categoryId} required>
          <Select id="add-categoryId" name="categoryId" defaultValue={defaultCategoryId ?? ""} aria-invalid={!!err.categoryId}>
            <option value="" disabled>
              בחירת סוג…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="add-location" label="מיקום" error={err.location} required>
          <Input id="add-location" name="location" list="ammo-locations" autoComplete="off" placeholder="למשל: בונקר פלוגתי" aria-invalid={!!err.location} />
          <datalist id="ammo-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field id="add-quantity" label="כמות שנספרה" error={err.quantity}>
          <Input id="add-quantity" name="quantity" inputMode="numeric" dir="ltr" className="text-start" placeholder="0" aria-invalid={!!err.quantity} />
        </Field>
      </div>
      {state?.error && <p className="text-danger text-sm">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "פתיחת מיקום"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          סגירה
        </Button>
      </div>
    </form>
  );
}

// ───────────── One location row with its movement panel ─────────────

const MODES: { type: AmmoLogType; label: string; hint: string }[] = [
  { type: "COUNT", label: "ספירה", hint: "הכמות שנספרה בפועל" },
  { type: "RECEIVE", label: "קליטה", hint: "כמות שהתקבלה" },
  { type: "ISSUE", label: "ניפוק", hint: "כמות שנופקה" },
];

export function StockRow({ stock, isAdmin }: { stock: AmmoStockRow; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AmmoLogType>("COUNT");
  const [state, action, pending] = useActionState(recordMovement.bind(null, stock.id), undefined);
  const [busy, startBusy] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const err = state?.errors ?? {};
  const current = MODES.find((m) => m.type === mode)!;

  return (
    <li className={cn(open && "bg-accent/30")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">{stock.location}</p>
          <p className="text-muted-foreground text-xs">נספר {formatDaysAgo(stock.lastCountedAt)}</p>
        </div>
        <span className="text-lg font-semibold tabular-nums">{formatNumber(stock.quantity)}</span>
        <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
          {/* Mode switch */}
          <div role="radiogroup" aria-label="סוג פעולה" className="bg-muted grid grid-cols-3 rounded-lg p-1">
            {MODES.map((m) => (
              <button
                key={m.type}
                type="button"
                role="radio"
                aria-checked={mode === m.type}
                onClick={() => setMode(m.type)}
                className={cn(
                  "flex h-10 items-center justify-center gap-1 rounded-md text-sm font-medium",
                  mode === m.type ? "bg-card shadow-xs" : "text-muted-foreground",
                )}
              >
                {m.type === "RECEIVE" && <Plus className="size-3.5" />}
                {m.type === "ISSUE" && <Minus className="size-3.5" />}
                {m.label}
              </button>
            ))}
          </div>

          <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="flex flex-col gap-3" noValidate>
            {state?.ok && <Success message={state.message} />}
            <input type="hidden" name="type" value={mode} />
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <Field id={`amount-${stock.id}`} label={current.hint} error={err.amount}>
                <Input
                  id={`amount-${stock.id}`}
                  name="amount"
                  inputMode="numeric"
                  dir="ltr"
                  className="h-12 text-start text-lg font-semibold"
                  placeholder={mode === "COUNT" ? String(stock.quantity) : "0"}
                  autoComplete="off"
                  aria-invalid={!!err.amount}
                />
              </Field>
              <Field id={`note-${stock.id}`} label="הערה" error={err.note}>
                <Input id={`note-${stock.id}`} name="note" autoComplete="off" placeholder={mode === "ISSUE" ? "למשל: מטווח מחלקה 2" : ""} />
              </Field>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "שומר…" : `שמירת ${current.label}`}
              </Button>
            </div>
            {state?.error && (
              <p role="alert" className="text-danger text-sm">
                {state.error}
              </p>
            )}
          </form>

          {stock.logs.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">תנועות אחרונות</p>
              <ul className="divide-y text-sm">
                {stock.logs.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                    <span className="font-medium">{AMMO_LOG_LABELS[l.type]}</span>
                    <span className="tabular-nums">
                      {formatNumber(l.previousQuantity)} ← {formatNumber(l.newQuantity)}
                    </span>
                    {l.note && <span className="text-muted-foreground">&quot;{l.note}&quot;</span>}
                    <span className="text-muted-foreground ms-auto text-xs">
                      {formatDateTime(l.createdAt)}
                      {l.performedBy && ` · ${l.performedBy.name}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isAdmin && stock.quantity === 0 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const r = await deleteStock(stock.id);
                    if (!r.ok) setDeleteError(r.message ?? "שגיאה");
                  })
                }
              >
                <Trash2 />
                הסרת מיקום ריק
              </Button>
              {deleteError && <span className="text-danger text-sm">{deleteError}</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
