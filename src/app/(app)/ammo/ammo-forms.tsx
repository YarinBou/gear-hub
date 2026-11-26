"use client";

import { createContext, startTransition, useActionState, useContext, useState, useTransition } from "react";
import { ArrowLeftRight, CheckCheck, CheckCircle2, ChevronDown, Minus, Plus, Trash2, User } from "lucide-react";
import { PlatoonBadge } from "@/components/platoon-badge";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SoldierSelect } from "@/components/soldier-select";
import { AMMO_LOG_LABELS } from "@/lib/ammo-rules";
import { cn, formatDateTime, formatDaysAgo, formatNumber } from "@/lib/utils";
import type { AmmoLogType } from "@/generated/prisma/enums";
import type { AmmoStockRow } from "@/lib/queries/ammo";
import type { SoldierOption } from "@/lib/queries/soldiers";
import { addStock, deleteStock, recordMovement, transferAmmo, verifyStocks, type VerifyResult } from "./actions";

/** Place names and soldiers for the transfer destination — given once for the whole page. */
const AmmoOptions = createContext<{ locations: string[]; soldiers: SoldierOption[] }>({ locations: [], soldiers: [] });

export function AmmoOptionsProvider({
  locations,
  soldiers,
  children,
}: {
  locations: string[];
  soldiers: SoldierOption[];
  children: React.ReactNode;
}) {
  return <AmmoOptions value={{ locations, soldiers }}>{children}</AmmoOptions>;
}

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
  soldiers,
  defaultCategoryId,
}: {
  categories: { id: string; name: string }[];
  locations: string[];
  soldiers: SoldierOption[];
  defaultCategoryId?: string;
}) {
  const [open, setOpen] = useState(!!defaultCategoryId);
  const [toSoldier, setToSoldier] = useState(false);
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
        <input type="hidden" name="holder" value={toSoldier ? "soldier" : "place"} />
        {toSoldier ? (
          <Field id="add-soldierId" label="חייל" error={err.soldierId} required>
            <SoldierSelect
              id="add-soldierId"
              name="soldierId"
              options={soldiers}
              allowEmpty={false}
              placeholder="בחירת חייל…"
              aria-invalid={!!err.soldierId}
            />
          </Field>
        ) : (
          <Field id="add-location" label="מיקום" error={err.location} required>
            <Input id="add-location" name="location" list="ammo-locations" autoComplete="off" placeholder="למשל: בונקר פלוגתי" aria-invalid={!!err.location} />
            <datalist id="ammo-locations">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
        )}
        <Field id="add-quantity" label="כמות שנספרה" error={err.quantity}>
          <Input id="add-quantity" name="quantity" inputMode="numeric" dir="ltr" className="text-start" placeholder="0" aria-invalid={!!err.quantity} />
        </Field>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="accent-primary size-5" checked={toSoldier} onChange={(e) => setToSoldier(e.target.checked)} />
        <User className="size-4" />
        אצל חייל (במקום מיקום)
      </label>
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

type Mode = AmmoLogType | "TRANSFER";
const MODES: { type: Mode; label: string; hint: string }[] = [
  { type: "COUNT", label: "ספירה", hint: "הכמות שנספרה בפועל" },
  { type: "RECEIVE", label: "קליטה", hint: "כמות שהתקבלה" },
  { type: "ISSUE", label: "ניפוק", hint: "כמות שנופקה" },
  { type: "TRANSFER", label: "העברה", hint: "כמות להעברה" },
];

/** Another row of the same ammo type — a transfer destination. */
export type SiblingStock = { id: string; location: string; isSoldier: boolean };

export function StockRow({ stock, isAdmin, siblings }: { stock: AmmoStockRow; isAdmin: boolean; siblings: SiblingStock[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("COUNT");
  const [state, action, pending] = useActionState(recordMovement.bind(null, stock.id), undefined);
  const [busy, startBusy] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const err = state?.errors ?? {};
  const current = MODES.find((m) => m.type === mode)!;

  return (
    <li className={cn(open && "bg-accent/30")}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="hover:bg-accent/50 flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 ps-4 pe-2 text-start"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {stock.soldier && <User className="text-muted-foreground size-4" aria-label="אצל חייל" />}
              {stock.location}
              {stock.soldier && <PlatoonBadge platoon={stock.soldier.platoon} />}
            </p>
            <p className="text-muted-foreground text-xs">נספר {formatDaysAgo(stock.lastCountedAt)}</p>
          </div>
          <span className="text-lg font-semibold tabular-nums">{formatNumber(stock.quantity)}</span>
          <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {/* אימות: the quantity is right — record a count without typing it again. */}
        <button
          type="button"
          disabled={verifying}
          onClick={() => startVerify(async () => setVerifyResult(await verifyStocks([{ id: stock.id, quantity: stock.quantity }])))}
          aria-label={`אימות הכמות ב${stock.location} (${formatNumber(stock.quantity)})`}
          title="אימות — הכמות נכונה"
          className="hover:bg-success/10 hover:text-success text-muted-foreground flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-s text-xs font-medium disabled:opacity-50"
        >
          <CheckCheck className="size-5" />
          {verifying ? "…" : "אימות"}
        </button>
      </div>
      {verifyResult && (
        <p
          role={verifyResult.ok ? "status" : "alert"}
          className={cn("px-4 pb-2 text-xs font-medium", verifyResult.ok ? "text-success" : "text-danger")}
        >
          {verifyResult.message}
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
          {/* Mode switch */}
          <div role="radiogroup" aria-label="סוג פעולה" className="bg-muted grid grid-cols-4 rounded-lg p-1">
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
                {m.type === "TRANSFER" && <ArrowLeftRight className="size-3.5" />}
                {m.label}
              </button>
            ))}
          </div>

          {mode === "TRANSFER" ? (
            <TransferForm stock={stock} siblings={siblings} />
          ) : (
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
          )}

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

// ───────────── Transfer to another location / soldier ─────────────

/**
 * העברה: the amount (all of it by default) goes from this row to another row of the same type, a
 * place (new or existing) or a soldier.
 */
function TransferForm({ stock, siblings }: { stock: AmmoStockRow; siblings: SiblingStock[] }) {
  const { locations, soldiers } = useContext(AmmoOptions);
  const [state, action, pending] = useActionState(transferAmmo.bind(null, stock.id), undefined);
  const [to, setTo] = useState(() => (siblings.find((x) => !x.isSoldier) ? `stock:${siblings.find((x) => !x.isSoldier)!.id}` : "place"));
  const err = state?.errors ?? {};
  const places = siblings.filter((x) => !x.isSoldier);
  const holders = siblings.filter((x) => x.isSoldier);

  if (stock.quantity === 0) {
    return <p className="text-muted-foreground text-sm">אין כמות להעברה במיקום הזה.</p>;
  }
  return (
    <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="flex flex-col gap-3" noValidate>
      {state?.ok && <Success message={state.message} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`to-${stock.id}`} label={`העברה מ${stock.location} אל`} error={err.to} required>
          <Select id={`to-${stock.id}`} name="to" value={to} onChange={(e) => setTo(e.target.value)}>
            {places.length > 0 && (
              <optgroup label="מיקומים">
                {places.map((x) => (
                  <option key={x.id} value={`stock:${x.id}`}>
                    {x.location}
                  </option>
                ))}
              </optgroup>
            )}
            {holders.length > 0 && (
              <optgroup label="אצל חיילים">
                {holders.map((x) => (
                  <option key={x.id} value={`stock:${x.id}`}>
                    {x.location}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="אחר">
              <option value="place">מיקום אחר / חדש…</option>
              <option value="soldier">חייל אחר…</option>
            </optgroup>
          </Select>
        </Field>
        {to === "place" && (
          <Field id={`to-location-${stock.id}`} label="מיקום" error={err.location} required>
            <Input
              id={`to-location-${stock.id}`}
              name="location"
              list={`to-locations-${stock.id}`}
              autoComplete="off"
              placeholder="למשל: בונקר פלוגתי"
              aria-invalid={!!err.location}
            />
            <datalist id={`to-locations-${stock.id}`}>
              {locations
                .filter((l) => l !== stock.location)
                .map((l) => (
                  <option key={l} value={l} />
                ))}
            </datalist>
          </Field>
        )}
        {to === "soldier" && (
          <Field id={`to-soldier-${stock.id}`} label="חייל" error={err.soldierId} required>
            <SoldierSelect
              id={`to-soldier-${stock.id}`}
              name="soldierId"
              options={soldiers}
              allowEmpty={false}
              placeholder="בחירת חייל…"
              aria-invalid={!!err.soldierId}
            />
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Field id={`t-amount-${stock.id}`} label={`כמות (יש ${formatNumber(stock.quantity)})`} error={err.amount}>
          <Input
            id={`t-amount-${stock.id}`}
            name="amount"
            inputMode="numeric"
            dir="ltr"
            className="h-12 text-start text-lg font-semibold"
            defaultValue={String(stock.quantity)}
            autoComplete="off"
            aria-invalid={!!err.amount}
          />
        </Field>
        <Field id={`t-note-${stock.id}`} label="הערה" error={err.note}>
          <Input id={`t-note-${stock.id}`} name="note" autoComplete="off" placeholder="למשל: זיכוי מחלקה 2" />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          <ArrowLeftRight />
          {pending ? "מעביר…" : "העברה"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

// ───────────── Verify a whole location at once ─────────────

/** "אימות כל המיקום": confirm every row shown for one location (e.g. חפ"ק) in one go. */
export function VerifyLocation({ label, rows }: { label: string; rows: { id: string; quantity: number }[] }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<VerifyResult | null>(null);
  if (!rows.length) return null;
  const verifyAll = () =>
    start(async () => {
      setResult(await verifyStocks(rows));
      setConfirming(false);
    });
  return (
    <div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            לאמת את {rows.length === 1 ? "השורה" : `כל ${rows.length} השורות`} ב{label}? הכמויות הרשומות יירשמו כספירה ללא שינוי.
          </p>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={verifyAll}>
              {pending ? "מאמת…" : "כן, אימות הכל"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">כל הכמויות ב{label} נכונות? אפשר לאמת את כולן בלחיצה אחת.</p>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setConfirming(true);
            }}
          >
            <CheckCheck />
            אימות כל המיקום ({rows.length})
          </Button>
        </div>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={cn("text-sm font-medium", result.ok ? "text-success" : "text-danger")}>
          {result.message}
        </p>
      )}
    </div>
  );
}
