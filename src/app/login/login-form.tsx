"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">שם משתמש</Label>
        <Input id="username" name="username" autoComplete="username" required dir="ltr" className="text-start" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">סיסמה</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      {state?.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "מתחבר…" : "התחברות"}
      </Button>
    </form>
  );
}
