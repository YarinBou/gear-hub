"use client";

import { useState, useTransition } from "react";
import { Minus, PackagePlus, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { addSoldierItem, returnSoldierItems, type LooseResult } from "../actions";

export type LooseItemRow = {
  id: string;
  quantity: number;
  note: string | null;
  updatedAt: Date;
  issuedBy: { name: string } | null;
  item: { id: string; label: string; groupName: string };
};

export type LooseItemOption = { id: string; label: string; groupName: string };

/**
 * פריטים מחוץ לתיק: checklist items handed to the soldier separately from any kit (e.g. a thigh pouch
 * on the move). Added from the company's list with a quantity; returned one by one or all at once,
 * with what came back and notes on gaps (kept in the soldier's return history).
 */
export function SoldierLooseItems({
  soldierId,
  rows,
  options,
  canEdit,
}: {
  soldierId: string;
  rows: LooseItemRow[];
  options: LooseItemOption[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<LooseResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  /** Rows being returned → how many came back. Null = not returning. */
  const [returning, setReturning] = useState<Record<string, number> | null>(null);
  const [gapNotes, setGapNotes] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<LooseResult>, after?: () => void) => {
    setResult(null);
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) after?.();
    });
  };
  const startReturn = (ids: string[]) => {
    setResult(null);
    setGapNotes({});
    setReturning(Object.fromEntries(rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.quantity])));
  };
  const groups = [...new Set(options.map((o) => o.groupName))];

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">אין פריטים מחוץ לתיק</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const back = returning?.[r.id];
            const short = back !== undefined && back < r.quantity;
            return (
              <li key={r.id} className="flex flex-col gap-2 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.item.label}
                      {r.quantity > 1 && <span className="tabular-nums"> × {r.quantity}</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(r.updatedAt)}
                      {r.issuedBy && ` · ${r.issuedBy.name}`}
                      {r.note && ` · ${r.note}`}
                    </p>
                  </div>
                  {back !== undefined ? (
                    <div className="flex items-center gap-1" role="group" aria-label={`כמה ${r.item.label} חזרו`}>
                      <Button type="button" variant="outline" size="icon" aria-label={`פחות ${r.item.label}`} disabled={pending || back <= 0}
                        onClick={() => setReturning((x) => ({ ...x!, [r.id]: back - 1 }))}>
                        <Minus />
                      </Button>
                      <span className={short ? "text-danger w-14 text-center font-semibold tabular-nums" : "w-14 text-center font-semibold tabular-nums"}>
                        {back}/{r.quantity}
                      </span>
                      <Button type="button" variant="outline" size="icon" aria-label={`עוד ${r.item.label}`} disabled={pending || back >= r.quantity}
                        onClick={() => setReturning((x) => ({ ...x!, [r.id]: back + 1 }))}>
                        <Plus />
                      </Button>
                    </div>
                  ) : (
                    canEdit &&
                    !returning && (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startReturn([r.id])}>
                        <Undo2 />
                        זיכוי
                      </Button>
                    )
                  )}
                </div>
                {short && (
                  <Input
                    aria-label={`הערה לפער ב${r.item.label}`}
                    placeholder="הערה לפער (למשל: אובדן, נהרס)"
                    maxLength={200}
                    value={gapNotes[r.id] ?? ""}
                    onChange={(e) => setGapNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    disabled={pending}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && returning && (
        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() => run(() => returnSoldierItems(soldierId, { returned: returning, gapNotes }), () => setReturning(null))}
          >
            <Undo2 />
            {pending ? "מזכה…" : "אישור זיכוי"}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setReturning(null)}>
            ביטול
          </Button>
        </div>
      )}

      {canEdit && !returning && (
        <div className="flex flex-wrap gap-2">
          {!adding && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <PackagePlus />
              הוספת פריט
            </Button>
          )}
          {rows.length > 1 && !adding && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => startReturn(rows.map((r) => r.id))}>
              <Undo2 />
              זיכוי הכל
            </Button>
          )}
        </div>
      )}

      {canEdit && adding && (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex gap-2">
            <Select aria-label="פריט" value={itemId} onChange={(e) => setItemId(e.target.value)} className="min-w-0 flex-1" disabled={pending}>
              <option value="">בחירת פריט מהרשימה…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {options
                    .filter((o) => o.groupName === g)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            <Input
              aria-label="כמות"
              inputMode="numeric"
              dir="ltr"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
              className="w-20 text-center"
              disabled={pending}
            />
          </div>
          <Input placeholder="הערה (לא חובה)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !itemId || !Number(qty)}
              onClick={() =>
                run(
                  () => addSoldierItem(soldierId, itemId, Number(qty), note),
                  () => {
                    setItemId("");
                    setQty("1");
                    setNote("");
                    setAdding(false);
                  },
                )
              }
            >
              <Plus />
              {pending ? "רושם…" : "הוספה"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAdding(false)}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-success text-sm" : "text-danger text-sm"}>
          {result.message}
        </p>
      )}
    </div>
  );
}
