"use client";

import { startTransition, useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { SoldierSelect } from "@/components/soldier-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SoldierOption } from "@/lib/queries/soldiers";
import type { WeaponOption } from "@/lib/queries/kits";
import { assignKit, updateWeapon, type KitFormState } from "../actions";

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
      <Field id="soldierId" label="לוחם" hint='מוצגים רק לוחמים שאין להם ערכה. החלפת לוחם מבטלת את ההחתמה הקיימת.'>
        <SoldierSelect
          id="soldierId"
          name="soldierId"
          options={soldiers}
          defaultValue={currentSoldierId ?? ""}
          emptyLabel="ללא — הערכה במלאי"
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
  current: { rifleType: string | null; personalWeaponId: string | null; magazineCount: number; ammoCount: number };
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
                  {o.category} · {o.serialNumber}
                </option>
              ))}
            </optgroup>
          )}
          {armory.length > 0 && (
            <optgroup label="בנשקייה">
              {armory.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.category} · {o.serialNumber}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="rifleType" label="סוג" error={err.rifleType}>
          <Input id="rifleType" name="rifleType" list="rifle-types" defaultValue={current.rifleType ?? ""} disabled={disabled} autoComplete="off" />
          <datalist id="rifle-types">
            {RIFLE_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field id="magazineCount" label="מחסניות" error={err.magazineCount}>
          <Input
            id="magazineCount"
            name="magazineCount"
            inputMode="numeric"
            dir="ltr"
            className="text-start"
            defaultValue={current.magazineCount}
            disabled={disabled}
          />
        </Field>
        <Field id="ammoCount" label="כדורים" error={err.ammoCount}>
          <Input
            id="ammoCount"
            name="ammoCount"
            inputMode="numeric"
            dir="ltr"
            className="text-start"
            defaultValue={current.ammoCount}
            disabled={disabled}
          />
        </Field>
      </div>
      <Button type="submit" variant="outline" className="sm:w-fit" disabled={pending || disabled}>
        {pending ? "שומר…" : "שמירת פרטי נשק"}
      </Button>
    </form>
  );
}
