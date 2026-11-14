"use client";

import { startTransition, useActionState, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlatoonBadge } from "@/components/platoon-badge";
import { PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, parseRosterText } from "@/lib/roster-import";
import type { Platoon } from "@/generated/prisma/enums";
import { importSoldiers } from "../actions";

const EXAMPLE = ["ישראל ישראלי\t8123456\t050-1234567\tמטול\t1", "דוד כהן\t8234567\t\tקשר\tחפ\"ק"].join("\n");

export function ImportForm() {
  const [state, action, pending] = useActionState(importSoldiers, undefined);
  const [text, setText] = useState("");
  const [defaultPlatoon, setDefaultPlatoon] = useState<Platoon | "">("");
  const deferredText = useDeferredValue(text);

  // Clear the paste after a successful import (so it can't be submitted twice), keep it on error.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.created !== undefined) setText("");
  }

  const rows = useMemo(
    () => parseRosterText(deferredText, defaultPlatoon || null),
    [deferredText, defaultPlatoon],
  );
  const valid = rows.filter((r) => r.ok);
  const invalid = rows.filter((r) => !r.ok);
  const tooMany = rows.length > MAX_IMPORT_ROWS;

  return (
    <div className="flex flex-col gap-4">
      {state?.created !== undefined && (
        <Card className="border-success/40 gap-3">
          <CardContent className="flex flex-col gap-3">
            <p className="text-success flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5" />
              {state.created === 1 ? "לוחם אחד נוסף" : `${state.created} לוחמים נוספו`} לסד&quot;כ
            </p>
            {state.skipped && state.skipped.length > 0 && (
              <div className="text-sm">
                <p className="mb-1 font-medium">{state.skipped.length} שורות דולגו:</p>
                <ul className="text-muted-foreground list-disc space-y-0.5 ps-5">
                  {state.skipped.map((s) => (
                    <li key={`${s.line}-${s.name}`}>
                      שורה {s.line} ({s.name}): {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button asChild variant="outline" className="w-fit">
              <Link href="/roster">מעבר לסד&quot;כ</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* onSubmit + transition instead of `action=`: React's automatic form reset would desync the controlled fields. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
        className="flex flex-col gap-4"
      >
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="defaultPlatoon">מחלקת ברירת מחדל</Label>
              <Select
                id="defaultPlatoon"
                name="defaultPlatoon"
                value={defaultPlatoon}
                onChange={(e) => setDefaultPlatoon(e.target.value as Platoon | "")}
              >
                <option value="">ללא — המחלקה תילקח מהעמודה החמישית</option>
                {PLATOONS.map((p) => (
                  <option key={p} value={p}>
                    {PLATOON_LABELS[p]}
                  </option>
                ))}
              </Select>
              <p className="text-muted-foreground text-xs">משמשת לשורות שבהן עמודת המחלקה ריקה.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="text">רשימת לוחמים</Label>
              <p className="text-muted-foreground text-xs">
                סדר העמודות: {IMPORT_COLUMNS.join(" | ")}. ניתן להפריד בטאב (העתקה מאקסל) או בפסיק. שורת כותרת תזוהה ותדולג.
              </p>
              <Textarea
                id="text"
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                rows={10}
                dir="auto"
                className="font-mono text-sm"
                spellCheck={false}
              />
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>תצוגה מקדימה</CardTitle>
              <CardDescription className="flex flex-wrap gap-2">
                <Badge variant="success">{valid.length} תקינות</Badge>
                {invalid.length > 0 && <Badge variant="danger">{invalid.length} שגויות (ידולגו)</Badge>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tooMany && (
                <p className="text-danger mb-3 text-sm">ניתן לייבא עד {MAX_IMPORT_ROWS} שורות בכל פעם.</p>
              )}
              <div className="-mx-5 max-h-96 overflow-auto px-5">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="text-muted-foreground bg-card sticky top-0 text-xs">
                    <tr className="border-b">
                      <th className="py-2 text-start font-medium">שורה</th>
                      <th className="py-2 text-start font-medium">שם</th>
                      <th className="py-2 text-start font-medium">מחלקה</th>
                      <th className="py-2 text-start font-medium">תפקיד</th>
                      <th className="py-2 text-start font-medium">מספר אישי</th>
                      <th className="py-2 text-start font-medium">טלפון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) =>
                      r.ok ? (
                        <tr key={r.line}>
                          <td className="text-muted-foreground py-2 tabular-nums">{r.line}</td>
                          <td className="py-2 font-medium">{r.data.name}</td>
                          <td className="py-2">
                            <PlatoonBadge platoon={r.data.platoon as Platoon} />
                          </td>
                          <td className="py-2">{r.data.position ?? "—"}</td>
                          <td className="py-2">
                            <span className="ltr-text tabular-nums">{r.data.personalNumber ?? "—"}</span>
                          </td>
                          <td className="py-2">
                            <span className="ltr-text tabular-nums">{r.data.phone ?? "—"}</span>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.line} className="bg-danger/5">
                          <td className="text-muted-foreground py-2 tabular-nums">{r.line}</td>
                          <td colSpan={5} className="py-2">
                            <span className="text-danger flex items-center gap-1.5">
                              <AlertTriangle className="size-4 shrink-0" />
                              {r.error}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">{r.raw}</span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {state?.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}

        <Button type="submit" size="lg" className="sm:w-fit" disabled={pending || valid.length === 0 || tooMany}>
          {pending ? "מייבא…" : valid.length === 1 ? "ייבוא לוחם אחד" : `ייבוא ${valid.length} לוחמים`}
        </Button>
      </form>
    </div>
  );
}
