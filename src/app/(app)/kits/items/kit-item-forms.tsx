"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  createKitItem,
  moveKitItem,
  setKitDefaultPresent,
  setKitCount,
  setKitItemActive,
  setKitItemStartPresent,
  updateKitItem,
  type KitItemFormState,
} from "./actions";

export type KitItemRow = {
  id: string;
  label: string;
  groupName: string;
  targetQuantity: number | null;
  systemKey: string | null;
  startPresent: boolean;
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

export function AddKitItemForm({ groups, startPresent }: { groups: string[]; startPresent: boolean }) {
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="startPresent" defaultChecked={startPresent} className="size-4" />
            מסומן כקיים בערכה חדשה
          </label>
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
        <span className={cn("min-w-0 flex-1 font-medium", !item.isActive && "text-muted-foreground line-through")}>
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
          aria-label={`${item.isActive ? "השבתת" : "הפעלת"} ${item.label}`}
          onClick={() => start(async () => void (await setKitItemActive(item.id, !item.isActive)))}
        >
          <Power />
          <span className="hidden sm:inline">{item.isActive ? "השבתה" : "הפעלה"}</span>
        </Button>
      </div>
      {/* Keyed by the saved value, so "הכל קיים / הכל חסר" resets it. */}
      {item.isActive && <StartToggle key={String(item.startPresent)} item={item} />}
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

/** One item's start state on a new (or not yet issued) kit. */
function StartToggle({ item }: { item: KitItemRow }) {
  const [value, setValue] = useState(item.startPresent);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">בערכה חדשה:</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value ? "present" : "missing"}
        disabled={pending}
        aria-label={`מצב התחלתי של ${item.label}`}
        onValueChange={(v) => {
          if (!v) return;
          const present = v === "present";
          setValue(present);
          start(async () => {
            const r = await setKitItemStartPresent(item.id, present);
            if (!r.ok) setValue(!present);
            setMessage(r.message ?? null);
          });
        }}
      >
        <ToggleGroupItem value="present" className="data-[state=on]:bg-success/15 data-[state=on]:text-success px-3">
          קיים
        </ToggleGroupItem>
        <ToggleGroupItem value="missing" className="data-[state=on]:bg-danger/15 data-[state=on]:text-danger px-3">
          חסר
        </ToggleGroupItem>
      </ToggleGroup>
      {message && <span className="text-muted-foreground text-xs">{message}</span>}
    </div>
  );
}

/** Every item's start state at once. */
export function KitDefaultSetting({ presentCount, total }: { presentCount: number; total: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const state = presentCount === 0 ? "missing" : presentCount === total ? "present" : "mixed";
  const option = (value: boolean, title: string, description: string) => {
    const selected = state === (value ? "present" : "missing");
    return (
      <button
        type="button"
        disabled={pending}
        aria-pressed={selected}
        onClick={() => start(async () => setMessage((await setKitDefaultPresent(value)).message ?? null))}
        className={cn(
          "flex min-h-11 items-start gap-3 rounded-lg border p-3 text-start disabled:opacity-60",
          selected && "border-primary bg-primary/5",
        )}
      >
        <span>
          <span className="block font-medium">{title}</span>
          <span className="text-muted-foreground block text-sm">{description}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">ערכה חדשה מתחילה כ…</p>
      {option(false, "הכל חסר", "כל פריט מסומן כחסר עד שמסמנים אותו במסדר או בהחתמה. מומלץ — כך שום דבר לא נחשב כמונפק בטעות.")}
      {option(true, "הכל קיים", "כל פריט מסומן כקיים (ופריטים עם כמות — בכמות המלאה), ומסמנים רק מה שחסר.")}
      {state === "mixed" && (
        <p className="text-sm font-medium">
          מעורב — {presentCount} מתוך {total} פריטים מתחילים כקיימים (נקבע לכל פריט ברשימה למטה).
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        אפשר גם לקבוע לכל פריט בנפרד ברשימה למטה. חל מיד על ערכות בהפעלה הפעילה שעדיין לא הונפקו (בלי לוחם, נשק או חתימה), על
        הפעלה חדשה שמתחילה &quot;נקי&quot; ועל פריטים שמוסיפים. ערכות מונפקות לא משתנות.
      </p>
      {message && <p className="text-success text-sm font-medium">{message}</p>}
    </div>
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
