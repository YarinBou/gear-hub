"use client";

import { startTransition, useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD } from "@/lib/validation/user";
import { changePassword } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const err = state?.errors ?? {};
  const pw = (name: string, label: string, autoComplete: string, hint?: string) => (
    <Field id={name} label={label} error={err[name]} hint={hint} required>
      <Input id={name} name={name} type="password" dir="ltr" className="text-start" autoComplete={autoComplete} aria-invalid={!!err[name]} />
    </Field>
  );

  return (
    // key: clear all three fields after a successful change
    <form
      key={state?.at ?? 0}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state?.ok && (
        <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {state.message}
        </p>
      )}
      {pw("current", "סיסמה נוכחית", "current-password")}
      {pw("next", "סיסמה חדשה", "new-password", `לפחות ${MIN_PASSWORD} תווים, אותיות וספרות`)}
      {pw("confirm", "אימות סיסמה חדשה", "new-password")}
      <Button type="submit" className="sm:w-fit" disabled={pending}>
        {pending ? "מעדכן…" : "עדכון סיסמה"}
      </Button>
    </form>
  );
}
