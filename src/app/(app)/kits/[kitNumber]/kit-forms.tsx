"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Field } from "@/components/form-field";
import { SoldierSelect } from "@/components/soldier-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EXTRA_AMMO_SUGGESTIONS, MAX_EXTRA_AMMO, type ExtraAmmo } from "@/lib/kit";
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
    magazineCount: number;
    ammoCount: number;
    extraAmmo: ExtraAmmo[];
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
      <ExtraAmmoRows initial={current.extraAmmo} disabled={disabled} error={err.extraAmmo} />
      <Button type="submit" variant="outline" className="sm:w-fit" disabled={pending || disabled}>
        {pending ? "שומר…" : "שמירת פרטי נשק"}
      </Button>
    </form>
  );
}

/**
 * Extra ammunition on the weapon card — only some soldiers have it (e.g. machine gunners sign for
 * Negev / MAG belt boxes). "+" adds a row: type (with suggestions) and quantity.
 */
function ExtraAmmoRows({ initial, disabled, error }: { initial: ExtraAmmo[]; disabled: boolean; error?: string }) {
  const [rows, setRows] = useState(() => initial.map((a, i) => ({ key: i, label: a.label, quantity: String(a.quantity) })));
  const [nextKey, setNextKey] = useState(initial.length);
  const add = () => {
    // Suggest a type not used yet.
    const used = new Set(rows.map((r) => r.label));
    const label = EXTRA_AMMO_SUGGESTIONS.find((l) => !used.has(l)) ?? "";
    setRows([...rows, { key: nextKey, label, quantity: "" }]);
    setNextKey(nextKey + 1);
  };
  const update = (key: number, patch: Partial<{ label: string; quantity: string }>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 && <p className="text-sm font-medium">תחמושת נוספת</p>}
      <datalist id="extra-ammo-types">
        {EXTRA_AMMO_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-2">
          <Input
            name="extraLabel"
            list="extra-ammo-types"
            aria-label={`סוג תחמושת נוספת ${i + 1}`}
            placeholder="למשל: תופי נגב"
            value={r.label}
            onChange={(e) => update(r.key, { label: e.target.value })}
            disabled={disabled}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Input
            name="extraQty"
            inputMode="numeric"
            dir="ltr"
            aria-label={`כמות ${r.label || "תחמושת נוספת"}`}
            placeholder="כמות"
            value={r.quantity}
            onChange={(e) => update(r.key, { quantity: e.target.value })}
            disabled={disabled}
            className="w-20 shrink-0 text-start"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`הסרת ${r.label || "שורה"}`}
            disabled={disabled}
            onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
          >
            <X />
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      {rows.length < MAX_EXTRA_AMMO && (
        <Button type="button" variant="ghost" size="sm" className="self-start" disabled={disabled} onClick={add}>
          <Plus />
          תחמושת נוספת (תופי נגב / מא&quot;ג…)
        </Button>
      )}
    </div>
  );
}
