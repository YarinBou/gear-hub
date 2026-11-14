"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Eye, Flag, Plus, Square } from "lucide-react";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { closeDeploymentAction, startDeploymentAction, viewDeployment } from "./actions";

export function StartDeploymentForm({ activeName, previousName }: { activeName: string | null; previousName: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(startDeploymentAction, undefined);
  const errors = state?.errors ?? {};
  // Default: continue from the previous deployment (if there is one).
  const [mode, setMode] = useState<"copy" | "empty">(previousName ? "copy" : "empty");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="sm:w-fit">
        <Flag />
        פתיחת הפעלה חדשה
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="bg-card flex flex-col gap-4 rounded-xl border p-4"
      noValidate
    >
      <Field id="dep-name" label="שם ההפעלה" error={errors.name} required hint='למשל "שכם 2026" או "גוש עציון — חורף"'>
        <Input id="dep-name" name="name" autoComplete="off" aria-invalid={!!errors.name} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">איך להתחיל?</legend>
        <ModeOption
          value="copy"
          checked={mode === "copy"}
          onChange={setMode}
          disabled={!previousName}
          title={previousName ? `להמשיך מ"${previousName}"` : "להמשיך מהפעלה קודמת"}
          description={
            previousName
              ? "החזקות הצל\"ם, שיוך הערכות לחיילים (כולל הצ'ק ליסט והנשק) ויתרות התחמושת עוברים להפעלה החדשה. החתימות לא עוברות — כל לוחם חותם מחדש."
              : "אין הפעלה קודמת להמשיך ממנה."
          }
        />
        <ModeOption
          value="empty"
          checked={mode === "empty"}
          onChange={setMode}
          title="להתחיל נקי"
          description="אף אחד לא מחזיק ציוד, הערכות ריקות ואין תחמושת רשומה. פריטים חסרים / בתיקון / מאופסנים נשארים במצבם."
        />
        <input type="hidden" name="mode" value={mode} />
      </fieldset>

      {activeName && (
        <p className="border-warning/60 bg-warning/10 rounded-lg border p-3 text-sm">
          פתיחת הפעלה חדשה תסיים את ההפעלה הנוכחית, &quot;{activeName}&quot;. היא תישמר בהיסטוריה לצפייה בלבד.
        </p>
      )}
      {state?.error && <p className="text-danger text-sm">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          <Plus />
          {pending ? "פותח…" : "פתיחת ההפעלה"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

function ModeOption({
  value,
  checked,
  onChange,
  disabled,
  title,
  description,
}: {
  value: "copy" | "empty";
  checked: boolean;
  onChange: (v: "copy" | "empty") => void;
  disabled?: boolean;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
        checked && "border-primary bg-primary/5",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="mode-choice"
        className="mt-1 size-4"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
    </label>
  );
}

export function CloseDeploymentButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`לסיים את ההפעלה "${name}"? אחרי הסיום היא תהיה לצפייה בלבד.`)) return;
          start(async () => {
            const res = await closeDeploymentAction(id);
            setMessage(res.ok ? null : (res.message ?? "שגיאה"));
          });
        }}
      >
        <Square />
        סיום ההפעלה
      </Button>
      {message && <p className="text-danger text-xs">{message}</p>}
    </div>
  );
}

export function ViewDeploymentButton({ id, viewing }: { id: string; viewing: boolean }) {
  const [pending, start] = useTransition();
  if (viewing) return <span className="text-primary text-xs font-medium">מוצגת כעת</span>;
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => viewDeployment(id))}>
      <Eye />
      צפייה
    </Button>
  );
}
