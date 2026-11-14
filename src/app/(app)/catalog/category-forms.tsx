"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { CheckCircle2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AMMO_CATEGORY_LABELS } from "@/lib/constants";
import { cn, formatNumber } from "@/lib/utils";
import type { AmmoCategory, CatalogDomain } from "@/generated/prisma/enums";
import {
  createCategory,
  deleteCategory,
  setCategoryActive,
  updateCategory,
} from "./actions";

type CategoryValues = {
  name: string;
  description: string | null;
  ammoCategory: AmmoCategory | null;
  minThreshold: number | null;
  requiresExpiry: boolean;
};

const AMMO_ORDER: AmmoCategory[] = ["STANDARD", "EXPLOSIVE", "NON_LETHAL"];

function CategoryFields({
  domain,
  values,
  errors,
  idPrefix,
}: {
  domain: CatalogDomain;
  values?: Partial<CategoryValues>;
  errors: Record<string, string>;
  idPrefix: string;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={id("name")} label="שם" error={errors.name} required>
        <Input id={id("name")} name="name" defaultValue={values?.name ?? ""} autoComplete="off" aria-invalid={!!errors.name} />
      </Field>
      <Field id={id("description")} label="תיאור" error={errors.description}>
        <Input id={id("description")} name="description" defaultValue={values?.description ?? ""} autoComplete="off" />
      </Field>
      {domain === "AMMUNITION" && (
        <>
          <Field id={id("ammoCategory")} label="קטגוריה" error={errors.ammoCategory} required>
            <Select id={id("ammoCategory")} name="ammoCategory" defaultValue={values?.ammoCategory ?? ""} aria-invalid={!!errors.ammoCategory}>
              <option value="" disabled>
                בחירת קטגוריה…
              </option>
              {AMMO_ORDER.map((c) => (
                <option key={c} value={c}>
                  {AMMO_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={id("minThreshold")}
            label="סף מינימום (כל הפלוגה)"
            error={errors.minThreshold}
            hint="מתחת לכמות זו תוצג התראת מלאי נמוך. ריק = ללא התראה."
          >
            <Input
              id={id("minThreshold")}
              name="minThreshold"
              inputMode="numeric"
              defaultValue={values?.minThreshold ?? ""}
              dir="ltr"
              className="text-start"
              aria-invalid={!!errors.minThreshold}
            />
          </Field>
        </>
      )}
      {domain === "STORAGE" && (
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="requiresExpiry" defaultChecked={values?.requiresExpiry ?? false} className="accent-primary size-5" />
          דורש מעקב תאריך תפוגה (חסמי עורקים, ציוד רפואי)
        </label>
      )}
    </div>
  );
}

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

// ───────────── Add ─────────────

export function AddCategoryForm({ domain, label }: { domain: CatalogDomain; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCategory.bind(null, domain), undefined);

  if (!open)
    return (
      <div className="flex flex-col gap-2">
        {state?.ok && <SuccessNote message={state.message} />}
        <Button onClick={() => setOpen(true)} className="sm:w-fit">
          <Plus />
          {label}
        </Button>
      </div>
    );

  return (
    // key: clears the fields after each successful add, so several types can be added in a row
    <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="bg-card flex flex-col gap-4 rounded-xl border p-4" noValidate>
      {state?.ok && <SuccessNote message={state.message} />}
      <CategoryFields domain={domain} errors={state?.errors ?? {}} idPrefix="new" />
      {state?.error && <p className="text-danger text-sm">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "הוספה"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          סגירה
        </Button>
      </div>
    </form>
  );
}

function SuccessNote({ message }: { message?: string }) {
  return (
    <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
      <CheckCircle2 className="size-4" />
      {message}
    </p>
  );
}

// ───────────── Row (view / edit) ─────────────

export function CategoryRow({
  category,
  domain,
  usageLabel,
}: {
  category: CategoryValues & { id: string; isActive: boolean; usage: number };
  domain: CatalogDomain;
  usageLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateCategory.bind(null, category.id), undefined);
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Close the editor once a save succeeds.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setEditing(false);
  }

  const toggleActive = () =>
    startBusy(async () => {
      const r = await setCategoryActive(category.id, !category.isActive);
      setMessage(r.ok ? null : (r.message ?? "שגיאה"));
    });
  const remove = () =>
    startBusy(async () => {
      const r = await deleteCategory(category.id);
      if (!r.ok) {
        setMessage(r.message ?? "שגיאה");
        setConfirmDelete(false);
      }
    });

  if (editing)
    return (
      <li className="bg-accent/30 px-4 py-4">
        <form onSubmit={submitWith(action)} className="flex flex-col gap-4" noValidate>
          <CategoryFields domain={domain} values={category} errors={state?.errors ?? {}} idPrefix={category.id} />
          {state?.error && <p className="text-danger text-sm">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ביטול
            </Button>
          </div>
        </form>
      </li>
    );

  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3", !category.isActive && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {category.name}
            {domain === "AMMUNITION" && category.ammoCategory && (
              <Badge variant={category.ammoCategory === "EXPLOSIVE" ? "danger" : category.ammoCategory === "NON_LETHAL" ? "warning" : "secondary"}>
                {AMMO_CATEGORY_LABELS[category.ammoCategory]}
              </Badge>
            )}
            {domain === "STORAGE" && category.requiresExpiry && <Badge variant="warning">מעקב תוקף</Badge>}
            {!category.isActive && <Badge variant="outline">מושבת</Badge>}
          </p>
          <p className="text-muted-foreground text-xs">
            {[
              category.description,
              domain === "AMMUNITION" && category.minThreshold != null ? `סף מינימום ${formatNumber(category.minThreshold)}` : null,
              category.usage ? `${formatNumber(category.usage)} ${usageLabel}` : "לא בשימוש",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`עריכת ${category.name}`}>
            <Pencil />
            עריכה
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={toggleActive}>
            <Power />
            {category.isActive ? "השבתה" : "הפעלה"}
          </Button>
          {category.usage === 0 && !confirmDelete && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)} aria-label={`מחיקת ${category.name}`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>למחוק את &quot;{category.name}&quot; לצמיתות?</span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>
            כן, מחיקה
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            ביטול
          </Button>
        </div>
      )}
      {message && <p className="text-danger text-sm">{message}</p>}
    </li>
  );
}
