"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { SoldierSelect } from "@/components/soldier-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SoldierOption } from "@/lib/queries/soldiers";
import type { WeaponOption } from "@/lib/queries/kits";
import { assignKit, setKitPakal, updateWeapon, type KitFormState } from "../actions";

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Feedback({ state }: { state: KitFormState }) {
  if (state?.ok && state.message)
    return (
      <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
        <CheckCircle2 className="size-4" />
        {state.message}
      </p>
    );
  if (state?.error)
    return (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    );
  return null;
}

export function AssignKitForm({
  kitNumber,
  soldiers,
  currentSoldierId,
}: {
  kitNumber: number;
  /** Already filtered to soldiers without a kit (+ the current holder). */
  soldiers: SoldierOption[];
  currentSoldierId: string | null;
}) {
  const [state, action, pending] = useActionState(assignKit.bind(null, kitNumber), undefined);
  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-3" noValidate>
      <Feedback state={state} />
      <Field
        id="soldierId"
        label="לוחם"
        hint={
          currentSoldierId
            ? "מוצגים רק לוחמים שאין להם ערכה. החלפת לוחם מבטלת את ההחתמה הקיימת. להחזרת הערכה למלאי — זיכוי ערכה."
            : "מוצגים רק לוחמים שאין להם ערכה."
        }
      >
        <SoldierSelect
          id="soldierId"
          name="soldierId"
          options={soldiers}
          defaultValue={currentSoldierId ?? ""}
          emptyLabel="ללא — הערכה במלאי"
          // With a holder, the kit goes back to stock through "זיכוי ערכה" (it checks what came back).
          allowEmpty={!currentSoldierId}
        />
      </Field>
      <Button type="submit" variant="outline" className="sm:w-fit" disabled={pending}>
        {pending ? "שומר…" : "עדכון שיוך"}
      </Button>
    </form>
  );
}

const RIFLE_TYPES = ["M16", "M4", "M4 קצר", "תבור", "נגב", "מאג"];

export function WeaponForm({
  kitNumber,
  options,
  current,
  disabled,
}: {
  kitNumber: number;
  options: WeaponOption[];
  current: {
    rifleType: string | null;
    personalWeaponId: string | null;
  };
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateWeapon.bind(null, kitNumber), undefined);
  const err = state?.errors ?? {};
  const held = options.filter((o) => o.heldBySoldier);
  const armory = options.filter((o) => !o.heldBySoldier);

  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <Field
        id="personalWeaponId"
        label='נשק (צ / מס"ט)'
        error={err.personalWeaponId}
        hint="בחירת נשק מהנשקייה תשייך אותו ללוחם ותירשם ביומן הצל״ם."
      >
        <Select id="personalWeaponId" name="personalWeaponId" defaultValue={current.personalWeaponId ?? ""} disabled={disabled}>
          <option value="">ללא קישור לפריט ממוספר</option>
          {held.length > 0 && (
            <optgroup label="משויכים ללוחם">
              {held.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.category} · {o.serialNumber ?? "ללא צ"}
                </option>
              ))}
            </optgroup>
          )}
          {armory.length > 0 && (
            <optgroup label="פנויים (בנשקייה / מאופסנים)">
              {armory.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.category} · {o.serialNumber ?? "ללא צ"}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
      <Field id="rifleType" label="סוג" error={err.rifleType} hint="מחסניות, כדורים ותופים נספרים ברשימת הציוד (תחמושת)">
        <Input id="rifleType" name="rifleType" list="rifle-types" defaultValue={current.rifleType ?? ""} disabled={disabled} autoComplete="off" />
        <datalist id="rifle-types">
          {RIFLE_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Button type="submit" variant="outline" className="sm:w-fit" disabled={pending || disabled}>
        {pending ? "שומר…" : "שמירת פרטי נשק"}
      </Button>
    </form>
  );
}

/** Admin: mark the kit as a פק"ל kit (its role's items become required) or a regular one. */
export function KitPakalForm({
  kitNumber,
  current,
  pakals,
}: {
  kitNumber: number;
  current: string | null;
  pakals: { id: string; name: string; isActive: boolean }[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  // Inactive ones can't be chosen, but the kit's own stays visible.
  const options = pakals.filter((p) => p.isActive || p.id === current);
  return (
    <div className="flex flex-col gap-2">
      <Field id="kit-pakal" label='תיק פק"ל' hint='פריטי החובה של הפק"ל נבדקים בתיק הזה. הסימון נשאר עם התיק גם בזיכוי ובהפעלה הבאה.'>
        <Select
          id="kit-pakal"
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setResult(null);
            start(async () => {
              const r = await setKitPakal(kitNumber, next || null);
              if (!r.ok) setValue(current ?? "");
              setResult(r);
            });
          }}
        >
          <option value="">תיק רגיל</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {result?.message && <p className={result.ok ? "text-success text-sm" : "text-danger text-sm"}>{result.message}</p>}
    </div>
  );
}
