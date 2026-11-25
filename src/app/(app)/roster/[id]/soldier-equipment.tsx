"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { Serial } from "@/components/equipment/serial";
import { AttributeTags } from "@/components/equipment/attribute-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { returnSoldierEquipment, type ReturnResult } from "../actions";

export type SoldierEquipmentItem = {
  id: string;
  serialNumber: string | null;
  parentId: string | null;
  category: { name: string };
  status: EquipmentStatus;
  stale: boolean;
  attributeTags: { label: string; missing: boolean }[];
};

/**
 * The soldier's equipment, with זיכוי per item or for everything at once. Returned items become
 * "מאופסן". Components of a set have no button — they come back with their main item.
 */
export function SoldierEquipment({
  soldierId,
  items,
  canReturn,
}: {
  soldierId: string;
  items: SoldierEquipmentItem[];
  canReturn: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [result, setResult] = useState<ReturnResult | null>(null);
  const returnable = items.filter((i) => !i.parentId);

  const run = (key: string, ids: string[] | "all") => {
    setBusy(key);
    setResult(null);
    start(async () => {
      setResult(await returnSoldierEquipment(soldierId, ids));
      setBusy(null);
      setConfirmAll(false);
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">אין פריטים משויכים</p>
        {result && <ResultLine result={result} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canReturn && returnable.length > 0 && (
        confirmAll ? (
          <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
            <p className="text-sm">
              לזכות את הלוחם על {returnable.length === 1 ? "הפריט" : `כל ${returnable.length} הפריטים`}? הם יעברו ל&quot;מאופסן&quot; ללא
              שיוך.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run("all", "all")}>
                {busy === "all" ? "מזכה…" : "כן, זיכוי הכל"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmAll(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => setConfirmAll(true)}>
            <Undo2 />
            זיכוי הכל
          </Button>
        )
      )}

      <ul className="divide-y">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
            <Link href={`/equipment/${e.id}`} className="hover:bg-accent -mx-2 -my-1 min-w-0 flex-1 rounded-md px-2 py-1">
              <p className="text-primary font-medium underline-offset-4 hover:underline">{e.category.name}</p>
              <p className="text-muted-foreground text-xs">
                <Serial value={e.serialNumber} />
                {e.parentId && " · רכיב — מזוכה עם הפריט הראשי"}
              </p>
              <AttributeTags tags={e.attributeTags} className="mt-1" />
            </Link>
            {e.stale && <Badge variant="warning">לא אומת</Badge>}
            <Badge variant={e.status === "MISSING" ? "danger" : "secondary"}>{EQUIPMENT_STATUS_LABELS[e.status]}</Badge>
            {canReturn && !e.parentId && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(e.id, [e.id])}
                aria-label={`זיכוי ${e.category.name}`}
              >
                <Undo2 />
                {busy === e.id ? "מזכה…" : "זיכוי"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {result && <ResultLine result={result} />}
    </div>
  );
}

function ResultLine({ result }: { result: ReturnResult }) {
  return (
    <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-success text-sm" : "text-danger text-sm"}>
      {result.message}
    </p>
  );
}
