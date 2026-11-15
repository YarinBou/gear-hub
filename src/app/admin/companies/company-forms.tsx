"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Building2, LogIn, Plus, Power } from "lucide-react";
import { Field } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TempPassword } from "@/app/(app)/users/user-forms";
import { createCompany, enterCompany, setCompanyActive } from "./actions";

export function AddCompanyForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCompany, undefined);
  const errors = state?.errors ?? {};

  return (
    <div className="flex flex-col gap-3">
      {state?.ok && <p className="text-success text-sm font-medium">{state.message}</p>}
      {state?.tempPassword && <TempPassword {...state.tempPassword} />}
      {!open ? (
        <Button onClick={() => setOpen(true)} className="sm:w-fit">
          <Building2 />
          פלוגה חדשה
        </Button>
      ) : (
        <form
          key={state?.at ?? 0}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => action(fd));
          }}
          className="bg-card flex flex-col gap-4 rounded-xl border p-4"
          noValidate
        >
          <Field id="company-name" label="שם הפלוגה" error={errors.name} required>
            <Input id="company-name" name="name" autoComplete="off" aria-invalid={!!errors.name} />
          </Field>
          <p className="text-muted-foreground text-sm">
            מנהל ראשון לפלוגה (מ&quot;פ / סמ&quot;פ). הוא יוכל להוסיף משתמשים נוספים בעצמו.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="admin-name" label="שם מלא" error={errors.adminName} required>
              <Input id="admin-name" name="adminName" autoComplete="off" aria-invalid={!!errors.adminName} />
            </Field>
            <Field id="admin-username" label="שם משתמש" error={errors.adminUsername} required hint="לכניסה למערכת. אותיות לועזיות וספרות.">
              <Input
                id="admin-username"
                name="adminUsername"
                dir="ltr"
                className="text-start"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.adminUsername}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-xs">
            הפלוגה נפתחת עם קטלוג ציוד ברירת מחדל ו-98 ערכות אישיות. ניתן לערוך את הקטלוג לאחר הכניסה.
          </p>
          {state?.error && <p className="text-danger text-sm">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Plus />
              {pending ? "יוצר…" : "יצירת פלוגה"}
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

export type CompanyRowData = {
  id: string;
  name: string;
  isActive: boolean;
  users: number;
  soldiers: number;
  items: number;
};

export function CompanyRow({ company }: { company: CompanyRowData }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          {company.name}
          {!company.isActive && <Badge variant="secondary">מושבתת</Badge>}
        </p>
        <p className="text-muted-foreground text-xs">
          {company.users} משתמשים · {company.soldiers} לוחמים · {company.items} פריטי צל&quot;ם
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => void (await setCompanyActive(company.id, !company.isActive)))}
      >
        <Power />
        {company.isActive ? "השבתה" : "הפעלה"}
      </Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            // Full page load on purpose: the client router keeps its prefetched "/" (a redirect back
            // here, from before a company was chosen) even after revalidatePath — verified in e2e.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            if ((await enterCompany(company.id)).ok) window.location.assign("/");
          })
        }
      >
        <LogIn className="rtl:-scale-x-100" />
        כניסה לפלוגה
      </Button>
    </li>
  );
}
