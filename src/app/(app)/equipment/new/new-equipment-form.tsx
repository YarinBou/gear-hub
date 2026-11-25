"use client";

import { startTransition, useActionState, useState } from "react";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SoldierSelect } from "@/components/soldier-select";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import type { PlatoonRef } from "@/lib/platoons";
import { MAX_BATCH_SERIALS } from "@/lib/validation/equipment";
import type { SoldierOption } from "@/lib/queries/soldiers";
import { createEquipment } from "../actions";
import type { AttributeDef } from "@/lib/equipment-attributes";

export function NewEquipmentForm({
  categories,
  soldiers,
  defaultCategoryId,
  platoons,
}: {
  categories: { id: string; name: string; attributeDefs: AttributeDef[] }[];
  soldiers: SoldierOption[];
  defaultCategoryId?: string;
  platoons: PlatoonRef[];
}) {
  const [state, action, pending] = useActionState(createEquipment, undefined);
  const v = state?.values ?? {};
  const err = state?.errors ?? {};
  const [serials, setSerials] = useState(v.serials ?? "");
  const [soldierId, setSoldierId] = useState(v.soldierId ?? "");
  const [noSerial, setNoSerial] = useState(v.noSerial === "on");
  const [quantity, setQuantity] = useState(v.quantity ?? "1");
  const [categoryId, setCategoryId] = useState(v.categoryId ?? defaultCategoryId ?? "");
  const attributeDefs = categories.find((c) => c.id === categoryId)?.attributeDefs ?? [];
  const serialCount = serials.split(/[\r\n,]+/).filter((s) => s.trim()).length;
  const count = noSerial ? Math.max(0, Math.floor(Number(quantity) || 0)) : serialCount;
  const soldier = soldiers.find((s) => s.id === soldierId);

  return (
    <form
      // onSubmit + manual action: keeps controlled fields intact after a failed submit
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <Field id="categoryId" label="סוג פריט" error={err.categoryId} required>
        <Select
          id="categoryId"
          name="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          aria-invalid={!!err.categoryId}
        >
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

      {attributeDefs.length > 0 && (
        <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">מאפיינים (לכל הפריטים שנקלטים)</legend>
          {attributeDefs.map((d) => (
            <Field key={d.key} id={`attr-${d.key}`} label={d.label}>
              <Select id={`attr-${d.key}`} name={`attr_${d.key}`} defaultValue={String(v[`attr_${d.key}`] ?? "")}>
                <option value="">לא סומן</option>
                {d.kind === "check" ? (
                  <>
                    <option value="yes">יש</option>
                    <option value="no">אין</option>
                  </>
                ) : (
                  d.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
                )}
              </Select>
            </Field>
          ))}
        </fieldset>
      )}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="noSerial"
          checked={noSerial}
          onChange={(e) => setNoSerial(e.target.checked)}
          className="accent-primary size-5"
        />
        <span>
          <span className="font-medium">ללא צ</span>
          <span className="text-muted-foreground"> — מספר הצ / מס״ט עוד לא ידוע (יעודכן בהמשך בדף הפריט)</span>
        </span>
      </label>

      {noSerial ? (
        <Field id="quantity" label="כמות" error={err.quantity} required hint={`כמה פריטים מסוג זה להוסיף (עד ${MAX_BATCH_SERIALS}).`}>
          <Input
            id="quantity"
            name="quantity"
            inputMode="numeric"
            dir="ltr"
            className="text-start sm:w-40"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!!err.quantity}
          />
        </Field>
      ) : (
        <Field
          id="serials"
          label='מספר צ / מס"ט'
          error={err.serials}
          required
          hint={`פריט אחד, או כמה פריטים מאותו סוג — מספר אחד בכל שורה (עד ${MAX_BATCH_SERIALS}).`}
        >
          <Textarea
            id="serials"
            name="serials"
            value={serials}
            onChange={(e) => setSerials(e.target.value)}
            rows={serialCount > 1 ? 6 : 2}
            dir="ltr"
            className="text-start font-mono"
            placeholder={"1234567\n1234568"}
            spellCheck={false}
            autoCapitalize="characters"
            aria-invalid={!!err.serials}
          />
          {serialCount > 1 && <p className="text-muted-foreground text-xs">{serialCount} פריטים יתווספו</p>}
        </Field>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="soldierId" label="שיוך ללוחם" error={err.soldierId}>
          <SoldierSelect
            id="soldierId"
            name="soldierId"
            options={soldiers}
            value={soldierId}
            onValueChange={setSoldierId}
            emptyLabel="ללא — נשאר בפלוגה"
          />
        </Field>
        <Field id="platoon" label="מחלקה" error={err.platoon}>
          {soldier ? (
            <p className="bg-muted flex h-11 items-center rounded-md px-3 text-sm">
              {soldier.platoon.name} <span className="text-muted-foreground ms-1">(לפי הלוחם)</span>
            </p>
          ) : (
            <Select id="platoon" name="platoon" defaultValue={v.platoon ?? ""}>
              <option value="">ללא מחלקה</option>
              {platoons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field id="status" label="סטטוס" error={err.status}>
        <Select id="status" name="status" defaultValue={v.status ?? ""} aria-invalid={!!err.status}>
          <option value="">{soldier ? "אוטומטי — אצל לוחם" : "אוטומטי — בנשקייה"}</option>
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EQUIPMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="notes" label="הערות" error={err.notes}>
        <Input id="notes" name="notes" defaultValue={v.notes ?? ""} autoComplete="off" />
      </Field>

      {state?.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="sm:w-fit" disabled={pending}>
        {pending ? "שומר…" : count > 1 ? `הוספת ${count} פריטים` : "הוספת פריט"}
      </Button>
    </form>
  );
}

