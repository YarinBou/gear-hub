"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Link2, Plus, ShieldCheck, Trash2, Unlink } from "lucide-react";
import { Field } from "@/components/form-field";
import { Serial } from "@/components/equipment/serial";
import { EquipmentStatusBadge } from "@/components/equipment/status-badge";
import { SoldierSelect } from "@/components/soldier-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { itemLabel } from "@/lib/equipment-rules";
import { cn } from "@/lib/utils";
import type { SoldierOption } from "@/lib/queries/soldiers";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import type { PlatoonRef } from "@/lib/platoons";
import {
  addNoSerialComponentAction,
  assignEquipment,
  attachComponentAction,
  type AttachResult,
  deleteEquipment,
  detachComponentAction,
  setItemSetAction,
  updateDetails,
  verifyEquipment,
  type FormState,
} from "../actions";

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
  platoons,
}: {
  itemId: string;
  soldiers: SoldierOption[];
  current: { soldierId: string | null; status: EquipmentStatus; platoon: PlatoonRef | null; holder?: SoldierOption };
  /** Active platoons. */
  platoons: PlatoonRef[];
}) {
  const [state, action, pending] = useActionState(assignEquipment.bind(null, itemId), undefined);
  const [soldierId, setSoldierId] = useState(current.soldierId ?? "");
  // The current holder must stay selectable even if they're not in the active options list.
  const options =
    current.holder && !soldiers.some((s) => s.id === current.holder!.id) ? [current.holder, ...soldiers] : soldiers;
  const soldier = options.find((s) => s.id === soldierId);
  const err = state?.errors ?? {};
  // A deactivated current platoon stays selectable.
  const platoonOptions =
    current.platoon && !platoons.some((p) => p.id === current.platoon!.id) ? [current.platoon, ...platoons] : platoons;

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
              {soldier.platoon.name} <span className="text-muted-foreground ms-1">(לפי הלוחם)</span>
            </p>
          ) : (
            <Select id="platoon" name="platoon" defaultValue={current.platoon?.id ?? ""}>
              <option value="">ללא מחלקה</option>
              {platoonOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
  current: { categoryId: string; categoryName: string; serialNumber: string | null; notes: string | null };
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
        <Field
          id="serialNumber"
          label='צ / מס"ט'
          error={err.serialNumber}
          hint={current.serialNumber ? undefined : 'הפריט נרשם "ללא צ" — הזינו את המספר כשהוא ידוע'}
        >
          <Input
            id="serialNumber"
            name="serialNumber"
            defaultValue={current.serialNumber ?? ""}
            placeholder="ללא צ"
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

export function DeleteItem({ itemId, label, hasComponents }: { itemId: string; label: string; hasComponents: boolean }) {
  const [state, action, pending] = useActionState(deleteEquipment.bind(null, itemId), undefined);
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="outline" className="text-danger w-full" onClick={() => setConfirming(true)}>
        <Trash2 />
        מחיקת פריט
      </Button>
    );
  const warnings = state?.historyWarnings;
  if (warnings?.length)
    return (
      <form onSubmit={submitWith(action)} className="flex flex-col gap-3">
        <input type="hidden" name="force" value="1" />
        <div role="alert" className="border-danger/50 bg-danger/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p className="text-danger flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            לפריט יש היסטוריה
          </p>
          <ul className="list-disc ps-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>
            מחיקה מלאה מתאימה לפריט שהוזן בטעות. הפריט <span className="font-semibold">{label}</span> וכל ההיסטוריה שלו יימחקו
            לצמיתות ולא ניתן יהיה לשחזר אותם. לפריט שאבד עדיף לסמן סטטוס &quot;חסר&quot;.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "מוחק…" : "מחיקה מלאה כולל היסטוריה"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            ביטול
          </Button>
        </div>
        {state?.error && <p className="text-danger text-sm">{state.error}</p>}
      </form>
    );
  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-2">
      <p className="text-sm">
        למחוק לצמיתות את <span className="font-semibold">{label}</span> וכל היסטוריית השיוך שלו? לא ניתן לבטל.
        {hasComponents && " הרכיבים המצורפים ינותקו ויישארו במערכת."} לפריט שאבד עדיף לסמן סטטוס &quot;חסר&quot;.
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

// ───────────── Linked sets ─────────────

type ComponentRow = {
  id: string;
  serialNumber: string | null;
  status: EquipmentStatus;
  category: { name: string };
};

type Candidate = {
  id: string;
  serialNumber: string | null;
  category: { name: string };
  assignedSoldier: { id: string; name: string } | null;
};

/**
 * Lists an item's components; attach more, or detach. Any item can be picked, including one
 * signed out to a soldier; if that's a different soldier than the main item's, the user chooses
 * where the set ends up before anything moves.
 */
export function ComponentsEditor({
  itemId,
  parentHolder,
  components,
  candidates,
}: {
  itemId: string;
  parentHolder: { id: string; name: string } | null;
  components: ComponentRow[];
  candidates: Candidate[];
}) {
  const [childId, setChildId] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AttachResult | null>(null);

  // Free ones first, then the main item's holder's, then other soldiers'.
  const sections: { label: string; items: Candidate[] }[] = [
    { label: "פנויים", items: candidates.filter((c) => !c.assignedSoldier) },
    ...(parentHolder
      ? [{ label: `אצל ${parentHolder.name}`, items: candidates.filter((c) => c.assignedSoldier?.id === parentHolder.id) }]
      : []),
    { label: "אצל לוחמים אחרים", items: candidates.filter((c) => c.assignedSoldier && c.assignedSoldier.id !== parentHolder?.id) },
  ].filter((s) => s.items.length);
  const chosen = candidates.find((c) => c.id === childId);
  const conflict = result?.conflict;

  const attach = (mode?: "takeOver" | "moveSet") =>
    start(async () => {
      const r = await attachComponentAction(itemId, childId, mode);
      setResult(r);
      if (r.ok) setChildId("");
    });

  return (
    <div className="flex flex-col gap-4">
      {components.length === 0 ? (
        <p className="text-muted-foreground text-sm">אין רכיבים מצורפים</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {components.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Link href={`/equipment/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <span className="font-medium">{c.category.name}</span>
                <Serial value={c.serialNumber} />
              </Link>
              <EquipmentStatusBadge status={c.status} />
              <DetachButton itemId={c.id} compact />
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            attach();
          }}
        >
          <Select
            aria-label="פריט לצירוף"
            value={childId}
            onChange={(e) => {
              setChildId(e.target.value);
              setResult(null);
            }}
            className="sm:min-w-64"
          >
            <option value="">בחירת פריט לצירוף…</option>
            {sections.map((s) => (
              <optgroup key={s.label} label={s.label}>
                {s.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {itemLabel(c)}
                    {c.assignedSoldier && c.assignedSoldier.id !== parentHolder?.id ? ` · אצל ${c.assignedSoldier.name}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Button type="submit" variant="outline" disabled={!childId || pending || !!conflict}>
            <Link2 />
            {pending ? "מצרף…" : "צירוף רכיב"}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-xs">אין פריטים זמינים לצירוף.</p>
      )}

      {conflict && chosen && (
        <div role="alert" className="border-warning/60 bg-warning/10 flex flex-col gap-3 rounded-lg border p-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">{itemLabel(chosen)}</span> חתום כרגע על{" "}
              <span className="font-semibold">{conflict.holder.name}</span>
              {conflict.parentHolder ? (
                <>
                  , והפריט הראשי חתום על <span className="font-semibold">{conflict.parentHolder.name}</span>
                </>
              ) : (
                <>, והפריט הראשי לא חתום על אף לוחם</>
              )}
              . רכיב תמיד נמצא אצל מי שמחזיק את הפריט הראשי. איך להמשיך?
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => attach("takeOver")}>
              {conflict.parentHolder ? `להעביר את הרכיב אל ${conflict.parentHolder.name}` : "להחזיר את הרכיב ולצרף (בלי לוחם)"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => attach("moveSet")}>
              {`להחתים את המארז כולו על ${conflict.holder.name}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setResult(null)}>
              ביטול
            </Button>
          </div>
        </div>
      )}
      {result && !conflict && <p className={result.ok ? "text-success text-sm" : "text-danger text-sm"}>{result.message}</p>}
    </div>
  );
}

export function DetachButton({ itemId, compact, className }: { itemId: string; compact?: boolean; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="ניתוק הרכיב מהפריט הראשי"
        onClick={() =>
          start(async () => {
            const r = await detachComponentAction(itemId);
            setError(r.ok ? null : (r.message ?? "שגיאה"));
          })
        }
      >
        <Unlink />
        {!compact && (pending ? "מנתק…" : "ניתוק")}
      </Button>
      {error && <span className="text-danger text-xs">{error}</span>}
    </span>
  );
}

// ───────────── Sets (מארזים) ─────────────

/** Choose which set this item is the main item of. */
export function SetPicker({ itemId, current, sets }: { itemId: string; current: { id: string; name: string } | null; sets: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // An inactive current set must still show as selected.
  const options = current && !sets.some((s) => s.id === current.id) ? [current, ...sets] : sets;
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label="מארז"
        value={current?.id ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await setItemSetAction(itemId, e.target.value || null);
            setError(r.ok ? null : (r.message ?? "שגיאה"));
          })
        }
        className="sm:max-w-72"
      >
        <option value="">ללא מארז</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}

/** Fill a missing set line with a new "ללא צ" component. */
export function AddNoSerialButton({ parentId, categoryId, label }: { parentId: string; categoryId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        title={`רישום ${label} חדש ללא צ וצירופו`}
        onClick={() =>
          start(async () => {
            const r = await addNoSerialComponentAction(parentId, categoryId);
            setError(r.ok ? null : (r.message ?? "שגיאה"));
          })
        }
      >
        <Plus />
        {pending ? "מוסיף…" : "ללא צ"}
      </Button>
      {error && <span className="text-danger text-xs">{error}</span>}
    </span>
  );
}
