"use client";

import { startTransition, useActionState, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronDown } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORAGE_STATUS_LABELS } from "@/lib/constants";
import { fillPercent } from "@/lib/storage-rules";
import { cn, formatDate, formatDaysAgo, formatNumber } from "@/lib/utils";
import type { StorageLine } from "@/lib/queries/storage";
import type { StorageStatus } from "@/generated/prisma/enums";
import { saveStorageLine } from "./actions";

const STATUS_BADGE: Record<StorageStatus, "success" | "warning" | "danger" | "secondary"> = {
  OK: "success",
  SHORTAGE: "warning",
  DAMAGED: "secondary",
  EXPIRED: "danger",
};
const BAR: Record<StorageStatus, string> = {
  OK: "bg-success",
  SHORTAGE: "bg-warning",
  DAMAGED: "bg-muted-foreground/60",
  EXPIRED: "bg-danger",
};

/** <input type="date"> wants yyyy-mm-dd (dates are stored at UTC midnight). */
function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function StorageRow({ line }: { line: StorageLine }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveStorageLine.bind(null, line.categoryId), undefined);
  const err = state?.errors ?? {};
  const pct = fillPercent(line.currentQuantity, line.targetQuantity);
  const missing = Math.max(0, line.targetQuantity - line.currentQuantity);

  // Close the editor after a successful save, keep it open on errors.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <li className={cn(open && "bg-accent/30", !line.isActive && "opacity-70")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent/40 flex w-full flex-col gap-2 px-4 py-3 text-start"
      >
        <div className="flex w-full items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {line.name}
              <Badge variant={STATUS_BADGE[line.status]}>{STORAGE_STATUS_LABELS[line.status]}</Badge>
              {/* Secondary conditions hidden behind the primary status */}
              {line.status !== "DAMAGED" && line.damaged && <Badge variant="secondary">בלאי</Badge>}
              {line.flags.expiringSoon && (
                <Badge variant="warning">
                  <CalendarClock />
                  תוקף {formatDate(line.expiryDate)}
                </Badge>
              )}
              {!line.isActive && <Badge variant="outline">מושבת בקטלוג</Badge>}
            </p>
            <p className="text-muted-foreground text-xs">
              {[
                line.location,
                line.requiresExpiry && line.expiryDate && !line.flags.expiringSoon ? `תוקף ${formatDate(line.expiryDate)}` : null,
                line.updatedAt ? `עודכן ${formatDaysAgo(line.updatedAt)}` : "טרם עודכן",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-end">
            <p className="font-semibold tabular-nums">
              {formatNumber(line.currentQuantity)}
              <span className="text-muted-foreground text-sm font-normal"> / {formatNumber(line.targetQuantity)}</span>
            </p>
            {missing > 0 && <p className="text-warning-foreground dark:text-warning text-xs font-medium">חסרים {formatNumber(missing)}</p>}
          </div>
          <ChevronDown className={cn("text-muted-foreground mt-1 size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div className={cn("h-full rounded-full", BAR[line.status])} style={{ width: `${pct}%` }} />
        </div>
      </button>

      {state?.ok && !open && (
        <p role="status" className="text-success flex items-center gap-1.5 px-4 pb-2 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {state.message}
        </p>
      )}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => action(fd));
          }}
          className="flex flex-col gap-4 px-4 pb-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field id={`cur-${line.categoryId}`} label="מצאי" error={err.currentQuantity}>
              <Input
                id={`cur-${line.categoryId}`}
                name="currentQuantity"
                inputMode="numeric"
                dir="ltr"
                className="h-12 text-start text-lg font-semibold"
                defaultValue={line.currentQuantity}
                aria-invalid={!!err.currentQuantity}
              />
            </Field>
            <Field id={`tgt-${line.categoryId}`} label="תקן" error={err.targetQuantity}>
              <Input
                id={`tgt-${line.categoryId}`}
                name="targetQuantity"
                inputMode="numeric"
                dir="ltr"
                className="h-12 text-start"
                defaultValue={line.targetQuantity}
                aria-invalid={!!err.targetQuantity}
              />
            </Field>
            {line.requiresExpiry && (
              <Field id={`exp-${line.categoryId}`} label="תאריך תפוגה קרוב" error={err.expiryDate}>
                <Input
                  id={`exp-${line.categoryId}`}
                  name="expiryDate"
                  type="date"
                  dir="ltr"
                  className="h-12 text-start"
                  defaultValue={toDateInput(line.expiryDate)}
                  aria-invalid={!!err.expiryDate}
                />
              </Field>
            )}
            <Field id={`loc-${line.categoryId}`} label="מיקום" error={err.location}>
              <Input id={`loc-${line.categoryId}`} name="location" className="h-12" defaultValue={line.location ?? ""} autoComplete="off" />
            </Field>
          </div>
          <Field id={`notes-${line.categoryId}`} label="הערות" error={err.notes}>
            <Input id={`notes-${line.categoryId}`} name="notes" defaultValue={line.notes ?? ""} autoComplete="off" />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="damaged" defaultChecked={line.damaged} className="accent-primary size-5" />
            חלק מהפריטים בבלאי / דורשים החלפה
          </label>
          {state?.error && <p className="text-danger text-sm">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
