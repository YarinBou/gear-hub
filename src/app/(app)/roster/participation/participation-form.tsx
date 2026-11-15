"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { PlatoonDot } from "@/components/platoon-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PlatoonRef } from "@/lib/platoons";
import { cn } from "@/lib/utils";
import { setPresence, type PresenceResult } from "../actions";

type Row = { id: string; name: string; platoon: PlatoonRef; position: string | null; inDeployment: boolean; holds: boolean };

export function ParticipationForm({ soldiers }: { soldiers: Row[] }) {
  const initial = useMemo(() => new Set(soldiers.filter((s) => s.inDeployment).map((s) => s.id)), [soldiers]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  // After a save the server sends fresh data: start again from it (skipped soldiers snap back).
  const [base, setBase] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    setSelected(initial);
  }
  const [results, setResults] = useState<PresenceResult[]>([]);
  const [pending, start] = useTransition();

  // Soldiers are already sorted by platoon order.
  const groups: { platoon: PlatoonRef; rows: Row[] }[] = [];
  for (const s of soldiers) {
    const g = groups.find((x) => x.platoon.id === s.platoon.id);
    if (g) g.rows.push(s);
    else groups.push({ platoon: s.platoon, rows: [s] });
  }

  const toIn = soldiers.filter((s) => selected.has(s.id) && !initial.has(s.id)).map((s) => s.id);
  const toOut = soldiers.filter((s) => !selected.has(s.id) && initial.has(s.id)).map((s) => s.id);
  const dirty = toIn.length + toOut.length > 0;

  const setMany = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const save = () =>
    start(async () => {
      const out: PresenceResult[] = [];
      if (toIn.length) out.push(await setPresence(toIn, true));
      if (toOut.length) out.push(await setPresence(toOut, false));
      setResults(out);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b py-2 backdrop-blur">
        <p className="text-sm font-medium tabular-nums">
          {selected.size} מתוך {soldiers.length} משתתפים
        </p>
        <Button size="sm" variant="ghost" onClick={() => setMany(soldiers.map((s) => s.id), true)}>
          סימון כולם
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMany(soldiers.filter((s) => !s.holds).map((s) => s.id), false)}>
          ניקוי כולם
        </Button>
        <Button className="ms-auto" disabled={!dirty || pending} onClick={save}>
          {pending ? "שומר…" : dirty ? `שמירה (${toIn.length + toOut.length} שינויים)` : "שמירה"}
        </Button>
      </div>

      {results.map((r, i) => (
        <p
          key={i}
          role="status"
          className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", r.ok ? "bg-success/10 text-success" : "text-danger")}
        >
          {r.ok && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          {r.message}
        </p>
      ))}

      {groups.map((g) => {
        const ids = g.rows.map((r) => r.id);
        const count = ids.filter((id) => selected.has(id)).length;
        return (
          <Card key={g.platoon.id} className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <PlatoonDot platoon={g.platoon} />
              <h2 className="font-semibold">{g.platoon.name}</h2>
              <span className="text-muted-foreground text-sm tabular-nums">
                {count}/{ids.length}
              </span>
              <span className="ms-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setMany(ids, true)}>
                  כולם
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMany(g.rows.filter((r) => !r.holds).map((r) => r.id), false)}>
                  אף אחד
                </Button>
              </span>
            </div>
            <ul className="divide-y">
              {g.rows.map((s) => {
                const on = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2", !on && "text-muted-foreground")}>
                      <input
                        type="checkbox"
                        className="accent-primary size-5"
                        checked={on}
                        // Holding equipment or a kit: has to be returned before leaving the deployment.
                        disabled={on && s.holds && initial.has(s.id)}
                        onChange={(e) => setMany([s.id], e.target.checked)}
                      />
                      <span className="flex-1">
                        <span className="font-medium">{s.name}</span>
                        {s.position && <span className="text-muted-foreground text-sm"> · {s.position}</span>}
                      </span>
                      {s.holds && <span className="text-muted-foreground text-xs">מחזיק ציוד</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
