"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createKitItem,
  moveKitItem,
  setKitDefaultPresent,
  setKitCount,
  setKitItemActive,
  updateKitItem,
  type KitItemFormState,
} from "./actions";

export type KitItemRow = {
  id: string;
  label: string;
  groupName: string;
  targetQuantity: number | null;
  systemKey: string | null;
  isActive: boolean;
};

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function ItemFields({ idPrefix, groups, values, errors }: { idPrefix: string; groups: string[]; values?: Partial<KitItemRow>; errors: Record<string, string> }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field id={id("label")} label="שם הפריט" error={errors.label} required>
        <Input id={id("label")} name="label" defaultValue={values?.label ?? ""} autoComplete="off" aria-invalid={!!errors.label} />
      </Field>
      <Field id={id("groupName")} label="קבוצה" error={errors.groupName} required hint="בחירה מהרשימה או שם חדש">
        <Input
          id={id("groupName")}
          name="groupName"
          list={id("groups")}
          defaultValue={values?.groupName ?? groups[0] ?? ""}
          autoComplete="off"
          aria-invalid={!!errors.groupName}
        />
        <datalist id={id("groups")}>
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Field>
      <Field id={id("targetQuantity")} label="כמות נדרשת" error={errors.targetQuantity} hint="ריק = קיים / חסר בלבד">
        <Input
          id={id("targetQuantity")}
          name="targetQuantity"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={values?.targetQuantity ?? ""}
          aria-invalid={!!errors.targetQuantity}
        />
      </Field>
    </div>
  );
}

export function AddKitItemForm({ groups }: { groups: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createKitItem, undefined);
  return (
    <div className="flex flex-col gap-2">
      {state?.ok && <p className="text-success text-sm font-medium">{state.message}</p>}
      {!open ? (
        <Button onClick={() => setOpen(true)} className="sm:w-fit">
          <Plus />
          הוספת פריט לרשימה
        </Button>
      ) : (
        <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="bg-card flex flex-col gap-3 rounded-xl border p-4" noValidate>
          <ItemFields idPrefix="new-item" groups={groups} errors={state?.errors ?? {}} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Plus />
              {pending ? "מוסיף…" : "הוספה"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              סגירה
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function KitItemLine({ item, groups, first, last }: { item: KitItemRow; groups: string[]; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [state, action, saving] = useActionState(
    async (prev: KitItemFormState, fd: FormData) => {
      const r = await updateKitItem(item.id, prev, fd);
      if (r?.ok) setEditing(false);
      return r;
    },
    undefined,
  );

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("flex-1 font-medium", !item.isActive && "text-muted-foreground line-through")}>
          {item.label}
          {item.targetQuantity != null && <span className="text-muted-foreground ms-2 text-sm">× {item.targetQuantity}</span>}
          {item.systemKey === "WEAPON" && (
            <Badge variant="secondary" className="ms-2">
              מסומן אוטומטית בקישור נשק
            </Badge>
          )}
        </span>
        {item.isActive && (
          <>
            <Button variant="ghost" size="icon" aria-label={`העלאת ${item.label}`} disabled={first || pending} onClick={() => start(async () => void (await moveKitItem(item.id, "up")))}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`הורדת ${item.label}`} disabled={last || pending} onClick={() => start(async () => void (await moveKitItem(item.id, "down")))}>
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`עריכת ${item.label}`} onClick={() => setEditing((v) => !v)}>
              <Pencil />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => start(async () => void (await setKitItemActive(item.id, !item.isActive)))}
        >
          <Power />
          {item.isActive ? "השבתה" : "הפעלה"}
        </Button>
      </div>
      {editing && (
        <form onSubmit={submitWith(action)} className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3" noValidate>
          <ItemFields idPrefix={`edit-${item.id}`} groups={groups} values={item} errors={state?.errors ?? {}} />
          {state?.error && <p className="text-danger text-sm">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ביטול
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function KitDefaultSetting({ present }: { present: boolean }) {
  const [pending, start] = useTransition();
  const option = (value: boolean, title: string, description: string) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", present === value && "border-primary bg-primary/5")}>
      <input
        type="radio"
        name="kit-default"
        className="mt-1 size-4"
        checked={present === value}
        disabled={pending}
        onChange={() => start(async () => void (await setKitDefaultPresent(value)))}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">ערכה חדשה מתחילה כ…</legend>
      {option(false, "הכל חסר", "כל פריט מסומן כחסר עד שמסמנים אותו במסדר או בהחתמה. מומלץ — כך שום דבר לא נחשב כמונפק בטעות.")}
      {option(true, "הכל קיים", "כל פריט מסומן כקיים (ופריטים עם כמות — בכמות המלאה), ומסמנים רק מה שחסר.")}
      <p className="text-muted-foreground text-xs">חל על ערכות של הפעלה חדשה שמתחילה &quot;נקי&quot;, ועל פריטים שמוסיפים לרשימה. ערכות קיימות לא משתנות.</p>
    </fieldset>
  );
}

/** How many personal kits the company has (not always 98). */
export function KitCountSetting({ count }: { count: number }) {
  const [value, setValue] = useState(String(count));
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const n = Math.floor(Number(value));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await setKitCount(n)));
      }}
    >
      <label htmlFor="kit-count" className="font-medium">
        מספר ערכות בפלוגה
      </label>
      <div className="flex gap-2">
        <Input
          id="kit-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28"
        />
        <Button type="submit" variant="outline" disabled={pending || !Number.isFinite(n) || n === count}>
          {pending ? "מעדכן…" : "עדכון"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        חל מיד על ההפעלה הפעילה: ערכות חדשות נוספות בסוף הרשימה. הקטנה אפשרית רק אם הערכות שמעל המספר לא מונפקות. הפעלות שהסתיימו לא
        משתנות.
      </p>
      {result?.message && <p className={cn("text-sm", result.ok ? "text-success font-medium" : "text-danger")}>{result.message}</p>}
    </form>
  );
}
