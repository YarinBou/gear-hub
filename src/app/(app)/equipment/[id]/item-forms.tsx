"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { SoldierSelect } from "@/components/soldier-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import type { SoldierOption } from "@/lib/queries/soldiers";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import { assignEquipment, deleteEquipment, updateDetails, verifyEquipment, type FormState } from "../actions";

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Feedback({ state }: { state: FormState }) {
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

// ───────────── Assignment ─────────────

export function AssignForm({
  itemId,
  soldiers,
  current,
}: {
  itemId: string;
  soldiers: SoldierOption[];
  current: { soldierId: string | null; status: EquipmentStatus; platoon: Platoon | null; holder?: SoldierOption };
}) {
  const [state, action, pending] = useActionState(assignEquipment.bind(null, itemId), undefined);
  const [soldierId, setSoldierId] = useState(current.soldierId ?? "");
  // The current holder must stay selectable even if they're not in the active options list.
  const options =
    current.holder && !soldiers.some((s) => s.id === current.holder!.id) ? [current.holder, ...soldiers] : soldiers;
  const soldier = options.find((s) => s.id === soldierId);
  const err = state?.errors ?? {};

  return (
    <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="soldierId" label="משויך ללוחם" error={err.soldierId}>
          <SoldierSelect
            id="soldierId"
            name="soldierId"
            options={options}
            value={soldierId}
            onChange={(e) => setSoldierId(e.target.value)}
            emptyLabel="ללא — הוחזר לפלוגה"
          />
        </Field>
        <Field id="platoon" label="מחלקה" error={err.platoon}>
          {soldier ? (
            <p className="bg-muted flex h-11 items-center rounded-md px-3 text-sm">
              {PLATOON_LABELS[soldier.platoon]} <span className="text-muted-foreground ms-1">(לפי הלוחם)</span>
            </p>
          ) : (
            <Select id="platoon" name="platoon" defaultValue={current.platoon ?? ""}>
              <option value="">ללא מחלקה</option>
              {PLATOONS.map((p) => (
                <option key={p} value={p}>
                  {PLATOON_LABELS[p]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field id="status" label="סטטוס" error={err.status} hint={`כרגע: ${EQUIPMENT_STATUS_LABELS[current.status]}`}>
        <Select id="status" name="status" defaultValue="">
          <option value="">אוטומטי — לפי השיוך</option>
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EQUIPMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="note" label="הערה ליומן" error={err.note}>
        <Input id="note" name="note" autoComplete="off" placeholder="למשל: הועבר לתיקון בסדנה" />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="verify" className="accent-primary size-5" />
        בוצע אימות פיזי עכשיו
      </label>
      <Button type="submit" size="lg" className="sm:w-fit" disabled={pending}>
        {pending ? "מעדכן…" : "עדכון שיוך"}
      </Button>
    </form>
  );
}

// ───────────── Details ─────────────

export function DetailsForm({
  itemId,
  categories,
  current,
}: {
  itemId: string;
  categories: { id: string; name: string }[];
  current: { categoryId: string; categoryName: string; serialNumber: string; notes: string | null };
}) {
  const [state, action, pending] = useActionState(updateDetails.bind(null, itemId), undefined);
  const err = state?.errors ?? {};
  // A deactivated category must still show for items that use it.
  const cats = categories.some((c) => c.id === current.categoryId)
    ? categories
    : [{ id: current.categoryId, name: current.categoryName }, ...categories];

  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="categoryId" label="סוג פריט" error={err.categoryId} required>
          <Select id="categoryId" name="categoryId" defaultValue={current.categoryId}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="serialNumber" label='צ / מס"ט' error={err.serialNumber} required>
          <Input
            id="serialNumber"
            name="serialNumber"
            defaultValue={current.serialNumber}
            dir="ltr"
            className="text-start font-mono"
            autoCapitalize="characters"
            aria-invalid={!!err.serialNumber}
          />
        </Field>
      </div>
      <Field id="notes" label="הערות" error={err.notes}>
        <Input id="notes" name="notes" defaultValue={current.notes ?? ""} autoComplete="off" />
      </Field>
      <Button type="submit" variant="outline" className="sm:w-fit" disabled={pending}>
        {pending ? "שומר…" : "שמירת פרטים"}
      </Button>
    </form>
  );
}

// ───────────── Verify + delete ─────────────

export function VerifyNowButton({ itemId }: { itemId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      size="lg"
      variant={done ? "secondary" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await verifyEquipment([itemId]);
          setDone(r.ok);
        })
      }
    >
      <ShieldCheck />
      {pending ? "מעדכן…" : done ? "אומת עכשיו" : "סימון כמאומת"}
    </Button>
  );
}

export function DeleteItem({ itemId, serial }: { itemId: string; serial: string }) {
  const [state, action, pending] = useActionState(deleteEquipment.bind(null, itemId), undefined);
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="outline" className="text-danger w-full" onClick={() => setConfirming(true)}>
        <Trash2 />
        מחיקת פריט
      </Button>
    );
  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-2">
      <p className="text-sm">
        למחוק לצמיתות את <span className="ltr-text font-mono">{serial}</span> וכל היסטוריית השיוך שלו? לא ניתן לבטל.
        לפריט שאבד עדיף לסמן סטטוס &quot;חסר&quot;.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "מוחק…" : "כן, מחיקה"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          ביטול
        </Button>
      </div>
      {state?.error && <p className="text-danger text-sm">{state.error}</p>}
    </form>
  );
}
