"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Check, ChevronDown, Copy, KeyRound, Plus, Power, UserPlus } from "lucide-react";
import { Field } from "@/components/form-field";
import { PlatoonBadge } from "@/components/platoon-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PLATOONS, PLATOON_LABELS, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Platoon, Role } from "@/generated/prisma/enums";
import { createUser, resetPassword, setUserActive, updateUser } from "./actions";

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

/** One-time display of a temporary password, with copy. */
function TempPassword({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="border-warning/60 bg-warning/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">סיסמה זמנית — מוצגת פעם אחת בלבד. יש למסור למשתמש ולבקש ממנו להחליף אותה בכניסה הראשונה.</p>
      <div className="flex flex-wrap items-center gap-3">
        <span>
          שם משתמש: <span className="ltr-text font-mono font-semibold">{username}</span>
        </span>
        <span>
          סיסמה: <span className="ltr-text bg-card rounded px-2 py-0.5 font-mono text-base font-semibold">{password}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              /* clipboard unavailable (http / permissions) — the password is still visible */
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "הועתק" : "העתקה"}
        </Button>
      </div>
    </div>
  );
}

function UserFields({
  idPrefix,
  values,
  errors,
  withUsername,
}: {
  idPrefix: string;
  values?: { name?: string; role?: Role; platoon?: Platoon | null };
  errors: Record<string, string>;
  withUsername?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={id("name")} label="שם מלא" error={errors.name} required>
        <Input id={id("name")} name="name" defaultValue={values?.name ?? ""} autoComplete="off" aria-invalid={!!errors.name} />
      </Field>
      {withUsername && (
        <Field id={id("username")} label="שם משתמש" error={errors.username} required hint="לכניסה למערכת. אותיות לועזיות וספרות.">
          <Input
            id={id("username")}
            name="username"
            dir="ltr"
            className="text-start"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.username}
          />
        </Field>
      )}
      <Field id={id("role")} label="הרשאה" error={errors.role} required>
        <Select id={id("role")} name="role" defaultValue={values?.role ?? "REGULAR"}>
          <option value="REGULAR">{ROLE_LABELS.REGULAR}</option>
          <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
        </Select>
      </Field>
      <Field id={id("platoon")} label="מחלקה" error={errors.platoon} hint='למ"מ — המחלקה שלו. ריק = כל הפלוגה.'>
        <Select id={id("platoon")} name="platoon" defaultValue={values?.platoon ?? ""}>
          <option value="">כל הפלוגה</option>
          {PLATOONS.map((p) => (
            <option key={p} value={p}>
              {PLATOON_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function AddUserForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, undefined);

  return (
    <div className="flex flex-col gap-3">
      {state?.tempPassword && <TempPassword {...state.tempPassword} />}
      {!open ? (
        <Button onClick={() => setOpen(true)} className="sm:w-fit">
          <UserPlus />
          הוספת משתמש
        </Button>
      ) : (
        <form key={state?.at ?? 0} onSubmit={submitWith(action)} className="bg-card flex flex-col gap-4 rounded-xl border p-4" noValidate>
          <UserFields idPrefix="new" errors={state?.errors ?? {}} withUsername />
          {state?.error && <p className="text-danger text-sm">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Plus />
              {pending ? "יוצר…" : "יצירת משתמש"}
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

export function UserRow({
  user,
  isMe,
}: {
  user: { id: string; name: string; username: string; role: Role; platoon: Platoon | null; isActive: boolean };
  isMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateUser.bind(null, user.id), undefined);
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);

  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <li className={cn("flex flex-col", !user.isActive && "opacity-60", open && "bg-accent/30")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent/40 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {user.name}
            {isMe && <Badge variant="outline">אני</Badge>}
            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role === "ADMIN" ? "מנהל" : "משתמש"}</Badge>
            {!user.isActive && <Badge variant="outline">מושבת</Badge>}
          </p>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <span className="ltr-text">{user.username}</span>
            {user.platoon ? <PlatoonBadge platoon={user.platoon} /> : <span>· כל הפלוגה</span>}
          </p>
        </div>
        <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {temp && (
        <div className="px-4 pb-3">
          <TempPassword {...temp} />
        </div>
      )}
      {message && <p className="text-danger px-4 pb-3 text-sm">{message}</p>}

      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <form onSubmit={submitWith(action)} className="flex flex-col gap-4" noValidate>
            <UserFields idPrefix={user.id} values={user} errors={state?.errors ?? {}} />
            {state?.error && <p className="text-danger text-sm">{state.error}</p>}
            <Button type="submit" size="sm" className="w-fit" disabled={pending}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !user.isActive}
              onClick={() =>
                startBusy(async () => {
                  const r = await resetPassword(user.id);
                  setMessage(r.ok ? null : (r.message ?? "שגיאה"));
                  setTemp(r.tempPassword ?? null);
                })
              }
            >
              <KeyRound />
              איפוס סיסמה
            </Button>
            {!isMe && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={user.isActive ? "text-danger" : undefined}
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const r = await setUserActive(user.id, !user.isActive);
                    setMessage(r.ok ? null : (r.message ?? "שגיאה"));
                  })
                }
              >
                <Power />
                {user.isActive ? "השבתת משתמש" : "הפעלה מחדש"}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
