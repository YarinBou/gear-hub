"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Pencil, Plus, Power, Star, X } from "lucide-react";
import { Field } from "@/components/form-field";
import { PakalBadge } from "@/components/pakal-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PakalDetail } from "@/lib/queries/kits";
import { createPakal, renamePakal, setPakalActive, setPakalItem } from "./actions";

type ItemOption = { id: string; label: string; counted: boolean };

/**
 * פק"לים: role kits (נגביסט / מא"ג / חובש…) and the checklist items each one requires. A kit
 * marked with a פק"ל (on its page, by an admin) must hold these, even items that are optional
 * for everyone else.
 */
export function PakalSettings({ pakals, items }: { pakals: PakalDetail[]; items: ItemOption[] }) {
  const [state, action, pending] = useActionState(createPakal, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="size-4" /> פק&quot;לים
        </CardTitle>
        <CardDescription>
          תיק פק&quot;ל (למשל נגביסט) חייב להכיל את הפריטים שמוגדרים לו כאן — גם פריטים שאצל כולם אופציונליים (תופים, וסט ייעודי). את
          התיק מסמנים כפק&quot;ל בדף הערכה.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pakals.map((p) => (
          <PakalCard key={p.id} pakal={p} items={items} />
        ))}
        <form
          key={state?.at ?? 0}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => action(fd));
          }}
          className="flex flex-col gap-2"
          noValidate
        >
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field id="pakal-name" label='פק"ל חדש' error={state?.errors?.name}>
                <Input id="pakal-name" name="name" placeholder='למשל: נגביסט, מא"ג, חובש' autoComplete="off" />
              </Field>
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              <Plus />
              הוספה
            </Button>
          </div>
          {state?.ok && <p className="text-success text-sm font-medium">{state.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function PakalCard({ pakal, items }: { pakal: PakalDetail; items: ItemOption[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pakal.name);
  const [addId, setAddId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const required = new Set(pakal.items.map((i) => i.itemId));
  const available = items.filter((i) => !required.has(i.id));
  const counted = (id: string) => items.find((i) => i.id === id)?.counted ?? false;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message ?? "השמירה נכשלה");
      else after?.();
    });
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renamePakal(pakal.id, name), () => setRenaming(false));
            }}
          >
            <Input aria-label='שם הפק"ל' value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            <Button type="submit" size="sm" disabled={pending}>
              שמירה
            </Button>
          </form>
        ) : (
          <>
            <PakalBadge pakal={pakal} className="text-sm" />
            {!pakal.isActive && <Badge variant="secondary">מושבת</Badge>}
            <span className="text-muted-foreground text-xs">
              {pakal._count.kits === 0 ? "לא סומנו תיקים" : pakal._count.kits === 1 ? "תיק אחד" : `${pakal._count.kits} תיקים`}
            </span>
          </>
        )}
        <span className="ms-auto flex gap-1">
          <Button variant="ghost" size="icon" aria-label={`שינוי שם ${pakal.name}`} onClick={() => setRenaming((v) => !v)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`${pakal.isActive ? "השבתת" : "הפעלת"} ${pakal.name}`}
            onClick={() => run(() => setPakalActive(pakal.id, !pakal.isActive))}
          >
            <Power />
            <span className="hidden sm:inline">{pakal.isActive ? "השבתה" : "הפעלה"}</span>
          </Button>
        </span>
      </div>

      {pakal.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">עדיין לא הוגדרו פריטי חובה</p>
      ) : (
        <ul className="divide-y text-sm">
          {pakal.items.map((i) => (
            <li key={i.itemId} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">{i.item.label}</span>
              {counted(i.itemId) ? (
                <Input
                  key={i.quantity}
                  aria-label={`כמות ${i.item.label}`}
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={i.quantity}
                  className="h-8 w-16 text-center"
                  disabled={pending}
                  onBlur={(e) => {
                    const q = Number(e.target.value);
                    if (Number.isInteger(q) && q > 0 && q !== i.quantity) run(() => setPakalItem(pakal.id, i.itemId, q));
                  }}
                />
              ) : (
                <span className="text-muted-foreground text-xs">חובה</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`הסרת ${i.item.label} מ${pakal.name}`}
                disabled={pending}
                onClick={() => run(() => setPakalItem(pakal.id, i.itemId, 0))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex items-end gap-2">
          <Select
            aria-label={`פריט חובה ל${pakal.name}`}
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            className="h-9 min-w-0 flex-1"
            disabled={pending}
          >
            <option value="">הוספת פריט חובה…</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
          {addId && counted(addId) && (
            <Input
              aria-label="כמות"
              inputMode="numeric"
              dir="ltr"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-16 text-center"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={pending || !addId}
            onClick={() =>
              run(
                () => setPakalItem(pakal.id, addId, counted(addId) ? Number(addQty) || 1 : 1),
                () => {
                  setAddId("");
                  setAddQty("1");
                },
              )
            }
          >
            <Plus />
            הוספה
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
