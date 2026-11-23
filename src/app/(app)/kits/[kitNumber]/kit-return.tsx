"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCheck, CheckCircle2, Minus, Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { groupLines, type ReturnCheckLine } from "@/lib/kit";
import { cn } from "@/lib/utils";
import { returnKit } from "../actions";

/**
 * זיכוי ערכה: walk down what the soldier signed for ("לפני") and mark what came back ("אחרי").
 * Gaps get a free-text note and are recorded — they never block the return. Confirming frees the
 * kit for the next soldier; its checklist keeps what actually came back. The weapon is returned separately, on the צל"ם side.
 */
export function KitReturn({
  kitNumber,
  soldierId,
  soldierName,
  lines,
  hasWeapon,
}: {
  kitNumber: number;
  soldierId: string;
  soldierName: string;
  lines: ReturnCheckLine[];
  hasWeapon: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [returned, setReturned] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const got = (l: ReturnCheckLine) => returned[l.key] ?? 0;
  const set = (l: ReturnCheckLine, n: number) => {
    setConfirming(false);
    setReturned((r) => ({ ...r, [l.key]: Math.min(Math.max(n, 0), l.expected) }));
  };
  const allBack = () => {
    setConfirming(false);
    setReturned(Object.fromEntries(lines.map((l) => [l.key, l.expected])));
  };
  const gaps = lines.filter((l) => got(l) < l.expected);
  const groups = groupLines(lines.map((l, i) => ({ ...l, sortOrder: i })));

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await returnKit(kitNumber, { soldierId, returned, gapNotes: notes, note });
      if (!r.ok) {
        setError(r.message ?? "הזיכוי נכשל");
        setConfirming(false);
      }
      // On success the page refreshes: the kit is no longer issued and this panel goes away.
    });
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          בדיקת מה שחזר מול מה ש{soldierName} חתם עליו. אחרי האישור הערכה חוזרת למלאי עם מה שחזר בפועל.
        </p>
        <Button variant="outline" className="sm:w-fit" onClick={() => setOpen(true)}>
          <Undo2 />
          זיכוי ערכה
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          סמנו מה חזר בפועל. <span className="text-muted-foreground">לפני = מה שנחתם · אחרי = מה שחזר</span>
        </p>
        <Button variant="outline" size="sm" onClick={allBack} disabled={pending}>
          <CheckCheck />
          הכל חזר
        </Button>
      </div>
      {hasWeapon && (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          הנשק האישי לא מזוכה כאן — הקישור שלו לערכה יוסר, והזיכוי עצמו נעשה דרך הצל&quot;ם.
        </p>
      )}

      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">אין פריטים שהלוחם חתם עליהם.</p>
      ) : (
        groups.map((g) => (
          <section key={g.groupName}>
            <h3 className="text-muted-foreground mb-1 text-xs font-semibold">{g.groupName}</h3>
            <ul className="divide-y rounded-md border">
              {g.lines.map((l) => {
                const back = got(l);
                const short = back < l.expected;
                return (
                  <li key={l.key} className={cn("flex flex-col gap-2 px-3 py-2", short ? "bg-danger/5" : "bg-success/5")}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{l.label}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          לפני {l.expected} · אחרי {back}
                        </p>
                      </div>
                      {l.counted ? (
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="icon" aria-label={`פחות ${l.label}`} onClick={() => set(l, back - 1)} disabled={pending || back <= 0}>
                            <Minus />
                          </Button>
                          <Input
                            aria-label={`כמה ${l.label} חזרו`}
                            inputMode="numeric"
                            dir="ltr"
                            className="h-10 w-16 text-center tabular-nums"
                            value={String(back)}
                            onChange={(e) => set(l, Number(e.target.value.replace(/\D/g, "")) || 0)}
                            disabled={pending}
                          />
                          <Button type="button" variant="outline" size="icon" aria-label={`עוד ${l.label}`} onClick={() => set(l, back + 1)} disabled={pending || back >= l.expected}>
                            <Plus />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant={short ? "outline" : "default"}
                          size="sm"
                          aria-pressed={!short}
                          onClick={() => set(l, short ? 1 : 0)}
                          disabled={pending}
                          className="w-24"
                        >
                          {short ? <X /> : <Check />}
                          {short ? "לא חזר" : "חזר"}
                        </Button>
                      )}
                    </div>
                    {short && (
                      <Input
                        aria-label={`הערה לפער ב${l.label}`}
                        placeholder="הערה לפער (למשל: אובדן, נהרס, משפט)"
                        maxLength={200}
                        value={notes[l.key] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [l.key]: e.target.value }))}
                        disabled={pending}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {gaps.length === 0 ? (
        <p role="status" className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
          <CheckCircle2 className="size-4 shrink-0" />
          הכל חזר — אין פערים
        </p>
      ) : (
        <div role="status" className="bg-danger/10 text-danger flex items-start gap-2 rounded-md px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{gaps.length === 1 ? "פער אחד" : `${gaps.length} פערים`}: </span>
            {gaps.map((l) => (l.expected > 1 ? `${l.label} (${got(l)}/${l.expected})` : l.label)).join(", ")}
            <span className="text-muted-foreground block text-xs">הפערים יתועדו בזיכוי — הם לא חוסמים אותו.</span>
          </span>
        </div>
      )}

      <Textarea placeholder="הערה כללית לזיכוי (לא חובה)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm">
            לזכות את {soldierName} על ערכה {kitNumber}
            {gaps.length ? ` עם ${gaps.length === 1 ? "פער אחד" : `${gaps.length} פערים`}` : ""}? השיוך, החתימה וכרטיס הנשק יתאפסו והערכה תחזור
            למלאי. רשימת הציוד תישאר עם מה שחזר בפועל.
          </p>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending ? "מזכה…" : "כן, זיכוי ואיפוס"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              חזרה לבדיקה
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            <Undo2 />
            אישור זיכוי
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </div>
      )}
    </div>
  );
}
