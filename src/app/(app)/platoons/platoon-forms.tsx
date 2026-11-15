"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { PlatoonDot } from "@/components/platoon-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createPlatoon,
  deletePlatoon,
  movePlatoon,
  renamePlatoon,
  setPlatoonActive,
  setPlatoonCount,
  type PlatoonResult,
} from "./actions";

function Message({ result }: { result: PlatoonResult | null }) {
  if (!result?.message) return null;
  return <p className={cn("text-sm", result.ok ? "text-success font-medium" : "text-danger")}>{result.message}</p>;
}

/** "How many platoons" — grows with default names, shrinks from the end. */
export function PlatoonCount({ current }: { current: number }) {
  const [value, setValue] = useState(String(current));
  const [result, setResult] = useState<PlatoonResult | null>(null);
  const [pending, start] = useTransition();
  const n = Math.floor(Number(value));
  const changed = Number.isFinite(n) && n !== current;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await setPlatoonCount(n)));
      }}
    >
      <label htmlFor="platoon-count" className="font-medium">
        מספר מחלקות
      </label>
      <div className="flex gap-2">
        <Input
          id="platoon-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={30}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24"
        />
        <Button type="submit" variant="outline" disabled={!changed || pending}>
          {pending ? "מעדכן…" : "עדכון"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        הגדלה מוסיפה מחלקות בשם &quot;מחלקה N&quot; שאפשר לשנות מיד. הקטנה מסירה את האחרונות ברשימה (רק אם אין בהן לוחמים).
      </p>
      <Message result={result} />
    </form>
  );
}

export function AddPlatoonButton() {
  const [result, setResult] = useState<PlatoonResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => start(async () => setResult(await createPlatoon("")))}>
        <Plus />
        {pending ? "מוסיף…" : "הוספת מחלקה"}
      </Button>
      <Message result={result} />
    </div>
  );
}

export function PlatoonLine({
  platoon,
  soldiers,
  first,
  last,
}: {
  platoon: { id: string; name: string; color: number; isActive: boolean };
  soldiers: number;
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(platoon.name);
  const [result, setResult] = useState<PlatoonResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<PlatoonResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r.ok && !r.message ? null : r);
      if (r.ok) after?.();
    });

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <PlatoonDot platoon={platoon} />
        {editing ? (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renamePlatoon(platoon.id, name), () => setEditing(false));
            }}
          >
            <Input aria-label="שם המחלקה" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} className="h-9" />
            <Button type="submit" variant="ghost" size="icon" aria-label="שמירה" disabled={pending}>
              <Check />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="ביטול"
              onClick={() => {
                setName(platoon.name);
                setEditing(false);
              }}
            >
              <X />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className={cn("flex min-h-11 flex-1 items-center gap-2 text-start font-medium", !platoon.isActive && "text-muted-foreground")}
            onClick={() => setEditing(true)}
          >
            {platoon.name}
            <Pencil className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-xs font-normal">{soldiers} לוחמים</span>
          </button>
        )}
        {!editing && platoon.isActive && (
          <>
            <Button variant="ghost" size="icon" aria-label={`העלאת ${platoon.name}`} disabled={first || pending} onClick={() => run(() => movePlatoon(platoon.id, "up"))}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`הורדת ${platoon.name}`} disabled={last || pending} onClick={() => run(() => movePlatoon(platoon.id, "down"))}>
              <ArrowDown />
            </Button>
          </>
        )}
        {!editing && (
          <>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setPlatoonActive(platoon.id, !platoon.isActive))}>
              <Power />
              {platoon.isActive ? "השבתה" : "הפעלה"}
            </Button>
            {soldiers === 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="text-danger"
                aria-label={`מחיקת ${platoon.name}`}
                disabled={pending}
                onClick={() => {
                  if (confirm(`למחוק את "${platoon.name}"?`)) run(() => deletePlatoon(platoon.id));
                }}
              >
                <Trash2 />
              </Button>
            )}
          </>
        )}
      </div>
      <Message result={result} />
    </li>
  );
}
