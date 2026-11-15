"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Link2, Plus, X } from "lucide-react";
import { Field } from "@/components/form-field";
import { Serial } from "@/components/equipment/serial";
import { SoldierSelect } from "@/components/soldier-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { itemLabel } from "@/lib/equipment-rules";
import { NEW_NO_SERIAL } from "@/lib/equipment-sets";
import type { SignItem, SignSet } from "@/lib/queries/sets";
import type { SoldierOption } from "@/lib/queries/soldiers";
import { cn } from "@/lib/utils";
import { signSetAction } from "../actions";

type Line = { key: string; categoryId: string; name: string; required: boolean };

export function SignSetForm({ sets, items, soldiers }: { sets: SignSet[]; items: SignItem[]; soldiers: SoldierOption[] }) {
  const [soldierId, setSoldierId] = useState("");
  const [setId, setSetId] = useState(sets.length === 1 ? sets[0].id : "");
  const [mainItemId, setMainItemId] = useState("");
  /** line key → item id, NEW_NO_SERIAL, or "" (not issued). */
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<{ key: number; itemId: string }[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string; itemId?: string } | null>(null);

  const set = sets.find((s) => s.id === setId);
  const byType = useMemo(() => {
    const m = new Map<string, SignItem[]>();
    for (const i of items) m.set(i.categoryId, [...(m.get(i.categoryId) ?? []), i]);
    return m;
  }, [items]);
  const mainOptions = set ? (byType.get(set.mainCategoryId) ?? []) : [];
  const main = mainOptions.find((i) => i.id === mainItemId);

  // One line per piece still needed: the set's quantity minus what the main item already carries.
  const lines: Line[] = [];
  const attached = new Map<string, number>();
  for (const c of main?.components ?? []) attached.set(c.categoryId, (attached.get(c.categoryId) ?? 0) + 1);
  for (const s of set?.slots ?? []) {
    const need = Math.max(0, s.quantity - (attached.get(s.categoryId) ?? 0));
    for (let n = 0; n < need; n++) {
      lines.push({ key: `${s.id}:${n}`, categoryId: s.categoryId, name: s.category.name, required: s.required });
    }
  }

  // An item can be picked once across the whole form.
  const taken = new Set([mainItemId, ...Object.values(picks), ...extras.map((e) => e.itemId)].filter((v) => v && v !== NEW_NO_SERIAL));
  const available = (categoryId: string | null, current: string) =>
    (categoryId ? (byType.get(categoryId) ?? []) : items).filter(
      (i) => i.components.length === 0 && i.id !== mainItemId && (!taken.has(i.id) || i.id === current),
    );

  const missing = lines.filter((l) => l.required && !picks[l.key]);
  const reset = (keepSoldier: boolean) => {
    if (!keepSoldier) setSoldierId("");
    setMainItemId("");
    setPicks({});
    setExtras([]);
    setNote("");
  };

  const submit = () => {
    const chosen = lines.map((l) => ({ l, v: picks[l.key] ?? "" })).filter((x) => x.v);
    start(async () => {
      const r = await signSetAction({
        setId,
        soldierId,
        mainItemId,
        componentIds: [...chosen.filter((x) => x.v !== NEW_NO_SERIAL).map((x) => x.v), ...extras.map((e) => e.itemId).filter(Boolean)],
        newComponentCategoryIds: chosen.filter((x) => x.v === NEW_NO_SERIAL).map((x) => x.l.categoryId),
        note,
      });
      setResult(r);
      if (r.ok) reset(false);
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {result?.ok && (
        <p role="status" className="bg-success/10 text-success flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {result.message}
          {result.itemId && (
            <Link href={`/equipment/${result.itemId}`} className="underline">
              לדף הפריט
            </Link>
          )}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="soldierId" label="לוחם" required>
          <SoldierSelect
            id="soldierId"
            options={soldiers}
            value={soldierId}
            onChange={(e) => setSoldierId(e.target.value)}
            allowEmpty={false}
            placeholder="בחירת לוחם…"
          />
        </Field>
        <Field id="setId" label="מארז" required>
          <Select
            id="setId"
            value={setId}
            onChange={(e) => {
              setSetId(e.target.value);
              reset(true);
            }}
          >
            <option value="" disabled>
              בחירת מארז…
            </option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {set && (
        <>
          {set.notes && <p className="text-muted-foreground -mt-2 text-sm">{set.notes}</p>}
          <Field
            id="mainItemId"
            label={`${set.mainCategory.name} (פריט ראשי)`}
            required
            hint={mainOptions.length ? undefined : "אין פריטים פנויים מסוג זה בנשקייה"}
          >
            <Select
              id="mainItemId"
              value={mainItemId}
              onChange={(e) => {
                setMainItemId(e.target.value);
                setPicks({});
              }}
            >
              <option value="" disabled>
                בחירת פריט…
              </option>
              {mainOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {itemLabel(i)}
                  {i.components.length ? ` (+${i.components.length} רכיבים מחוברים)` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {main && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">רכיבים</legend>
              {main.components.map((c) => (
                <div key={c.id} className="bg-success/5 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Link2 className="text-success size-4 shrink-0" />
                  <span className="font-medium">{c.category.name}</span>
                  <Serial value={c.serialNumber} />
                  <span className="text-muted-foreground ms-auto text-xs">כבר מחובר</span>
                </div>
              ))}
              {lines.map((l) => {
                const value = picks[l.key] ?? "";
                const options = available(l.categoryId, value);
                return (
                  <div
                    key={l.key}
                    className={cn(
                      "grid items-center gap-2 rounded-lg border px-3 py-2 sm:grid-cols-[10rem_1fr]",
                      l.required && !value && "border-warning/60",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {l.name}
                      {!l.required && <Badge variant="secondary">תוספת</Badge>}
                    </span>
                    <Select
                      aria-label={l.name}
                      value={value}
                      onChange={(e) => setPicks((p) => ({ ...p, [l.key]: e.target.value }))}
                    >
                      <option value="">{l.required ? "לא נופק (יסומן כחסר)" : "ללא"}</option>
                      <option value={NEW_NO_SERIAL}>ללא צ — רישום פריט חדש</option>
                      {options.length > 0 && (
                        <optgroup label="פנויים בנשקייה">
                          {options.map((i) => (
                            <option key={i.id} value={i.id}>
                              {itemLabel(i)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                  </div>
                );
              })}
              {lines.length === 0 && main.components.length > 0 && (
                <p className="text-success text-sm">כל רכיבי המארז כבר מחוברים לפריט הזה.</p>
              )}

              {extras.map((x, n) => {
                const options = available(null, x.itemId);
                const groups = new Map<string, SignItem[]>();
                for (const i of options) groups.set(i.category.name, [...(groups.get(i.category.name) ?? []), i]);
                return (
                  <div key={x.key} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-dashed px-3 py-2 sm:grid-cols-[10rem_1fr_auto]">
                    <span className="text-sm font-medium max-sm:hidden">תוספת {n + 1}</span>
                    <Select
                      aria-label={`תוספת ${n + 1}`}
                      value={x.itemId}
                      onChange={(e) => setExtras((all) => all.map((y) => (y.key === x.key ? { ...y, itemId: e.target.value } : y)))}
                    >
                      <option value="">בחירת פריט…</option>
                      {[...groups].map(([type, list]) => (
                        <optgroup key={type} label={type}>
                          {list.map((i) => (
                            <option key={i.id} value={i.id}>
                              {itemLabel(i)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`הסרת תוספת ${n + 1}`}
                      onClick={() => setExtras((all) => all.filter((y) => y.key !== x.key))}
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setExtras((all) => [...all, { key: Date.now(), itemId: "" }])}
              >
                <Plus />
                תוספת שלא במארז
              </Button>
            </fieldset>
          )}

          {main && (
            <Field id="note" label="הערה ליומן">
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
            </Field>
          )}

          {main && missing.length > 0 && (
            <p className="bg-warning/15 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                חסרים במארז: {missing.map((l) => l.name).join(", ")}. אפשר להחתים בכל זאת, והפריט יסומן &quot;מארז חסר&quot;.
              </span>
            </p>
          )}
        </>
      )}

      {result && !result.ok && (
        <p role="alert" className="text-danger text-sm">
          {result.message}
        </p>
      )}
      <Button type="submit" size="lg" className="sm:w-fit" disabled={pending || !soldierId || !setId || !mainItemId}>
        {pending ? "מחתים…" : "החתמת מארז"}
      </Button>
    </form>
  );
}
