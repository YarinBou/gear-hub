"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PlatoonRef } from "@/lib/platoons";
import type { SoldierFormState } from "./actions";

type Values = Partial<Record<"name" | "personalNumber" | "phone" | "platoon" | "position", string>>;

const COMMON_POSITIONS = ["לוחם", "מ\"כ", "סמל", "מטול", "מקלען", "נגביסט", "קשר", "חובש", "צלף", "נהג", "רחפנאי"];

export function SoldierForm({
  action,
  initial = {},
  mode,
  platoons,
}: {
  action: (prev: SoldierFormState, formData: FormData) => Promise<SoldierFormState>;
  initial?: Values;
  mode: "create" | "edit";
  /** Active platoons (plus the soldier's current one if it was deactivated). */
  platoons: PlatoonRef[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = (k: keyof Values) => state?.values?.[k] ?? (state?.ok && mode === "create" ? "" : initial[k]) ?? "";
  const err = state?.errors ?? {};

  return (
    // key: remount after each result so defaultValues apply (keeps values on error, clears after "save & add another")
    <form key={JSON.stringify(state)} action={formAction} className="flex flex-col gap-5" noValidate>
      {state?.ok && state.message && (
        <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {state.message}
        </p>
      )}

      <Field id="name" label="שם מלא" error={err.name} required>
        <Input id="name" name="name" defaultValue={v("name")} autoComplete="off" required autoFocus={mode === "create"} aria-invalid={!!err.name} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="platoon" label="מחלקה" error={err.platoon} required>
          <Select id="platoon" name="platoon" defaultValue={v("platoon")} required aria-invalid={!!err.platoon}>
            <option value="" disabled>
              בחירת מחלקה…
            </option>
            {platoons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="position" label="תפקיד" error={err.position}>
          <Input id="position" name="position" list="positions" defaultValue={v("position")} autoComplete="off" aria-invalid={!!err.position} />
          <datalist id="positions">
            {COMMON_POSITIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="personalNumber" label="מספר אישי" error={err.personalNumber}>
          <Input
            id="personalNumber"
            name="personalNumber"
            inputMode="numeric"
            dir="ltr"
            className="text-start"
            defaultValue={v("personalNumber")}
            autoComplete="off"
            aria-invalid={!!err.personalNumber}
          />
        </Field>
        <Field id="phone" label="טלפון" error={err.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            className="text-start"
            defaultValue={v("phone")}
            autoComplete="off"
            placeholder="050-0000000"
            aria-invalid={!!err.phone}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={pending} name="intent" value="save">
          {pending ? "שומר…" : mode === "create" ? "שמירה" : "שמירת שינויים"}
        </Button>
        {mode === "create" && (
          <Button type="submit" size="lg" variant="outline" disabled={pending} name="intent" value="again">
            שמירה והוספת לוחם נוסף
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-danger">*</span>}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
