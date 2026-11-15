"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Boxes, CheckCheck, CheckCircle2, Link2, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Serial } from "@/components/equipment/serial";
import { EquipmentStatusBadge } from "@/components/equipment/status-badge";
import { PlatoonBadge } from "@/components/platoon-badge";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { isStale, itemLabel } from "@/lib/equipment-rules";
import { cn, formatDaysAgo } from "@/lib/utils";
import type { EquipmentListItem } from "@/lib/queries/equipment";
import { bulkSetPlatoon, bulkSetStatus, verifyEquipment, type BulkResult } from "./actions";

export function EquipmentList({ items }: { items: EquipmentListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [verifying, setVerifying] = useState<string | null>(null);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const run = (fn: () => Promise<BulkResult>, clear = true) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok && clear) setSelected(new Set());
    });

  const quickVerify = (id: string) => {
    setVerifying(id);
    startTransition(async () => {
      setResult(await verifyEquipment([id]));
      setVerifying(null);
    });
  };

  const ids = [...selected];

  return (
    <>
      {result && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
            result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
          )}
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="flex-1">{result.message}</span>
          <button type="button" onClick={() => setResult(null)} aria-label="סגירה" className="p-1">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Mobile: cards */}
      <Card className="gap-0 py-0 md:hidden">
        <label className="text-muted-foreground flex h-11 items-center gap-3 border-b px-4 text-sm">
          <input type="checkbox" className="accent-primary size-5" checked={allSelected} onChange={toggleAll} />
          בחירת הכל ({items.length})
        </label>
        <ul className="divide-y">
          {items.map((i) => {
            const stale = isStale(i);
            return (
              <li key={i.id} className={cn("flex items-center", selected.has(i.id) && "bg-accent/60")}>
                <label className="flex h-16 w-12 shrink-0 items-center justify-center" aria-label={`בחירת ${itemLabel(i)}`}>
                  <input
                    type="checkbox"
                    className="accent-primary size-5"
                    checked={selected.has(i.id)}
                    onChange={() => toggle(i.id)}
                  />
                </label>
                <Link href={`/equipment/${i.id}`} className="min-w-0 flex-1 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.category.name}</span>
                    <Serial value={i.serialNumber} className="text-muted-foreground text-sm" />
                    <SetMarker item={i} />
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <EquipmentStatusBadge status={i.status} />
                    {i.platoon && <PlatoonBadge platoon={i.platoon} />}
                    <span>{i.assignedSoldier?.name ?? "ללא שיוך"}</span>
                    <span className={cn(stale && "text-warning-foreground dark:text-warning font-medium")}>
                      אומת {formatDaysAgo(i.lastVerifiedAt)}
                    </span>
                  </p>
                </Link>
                <VerifyButton
                  stale={stale}
                  busy={pending && verifying === i.id}
                  onClick={() => quickVerify(i.id)}
                  className="me-1"
                />
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Desktop: table */}
      <Card className="hidden gap-0 overflow-hidden py-0 md:flex">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-xs">
            <tr>
              <th className="w-10 ps-4">
                <input type="checkbox" className="accent-primary size-4" checked={allSelected} onChange={toggleAll} aria-label="בחירת הכל" />
              </th>
              <th className="px-3 py-3 text-start font-medium">סוג</th>
              <th className="px-3 py-3 text-start font-medium">צ / מס&quot;ט</th>
              <th className="px-3 py-3 text-start font-medium">משויך ל</th>
              <th className="px-3 py-3 text-start font-medium">מחלקה</th>
              <th className="px-3 py-3 text-start font-medium">סטטוס</th>
              <th className="px-3 py-3 text-start font-medium">אימות אחרון</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => {
              const stale = isStale(i);
              return (
                <tr key={i.id} className={cn("hover:bg-accent/40", selected.has(i.id) && "bg-accent/60")}>
                  <td className="ps-4">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={selected.has(i.id)}
                      onChange={() => toggle(i.id)}
                      aria-label={`בחירת ${itemLabel(i)}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/equipment/${i.id}`} className="hover:underline">
                      {i.category.name}
                    </Link>
                    <SetMarker item={i} className="ms-2" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/equipment/${i.id}`} className="hover:underline">
                      <Serial value={i.serialNumber} />
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {i.assignedSoldier ? (
                      <Link href={`/roster/${i.assignedSoldier.id}`} className="hover:underline">
                        {i.assignedSoldier.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <PlatoonBadge platoon={i.platoon} />
                  </td>
                  <td className="px-3 py-2.5">
                    <EquipmentStatusBadge status={i.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {stale ? (
                      <Badge variant="warning">{formatDaysAgo(i.lastVerifiedAt)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{formatDaysAgo(i.lastVerifiedAt)}</span>
                    )}
                  </td>
                  <td className="pe-2 text-end">
                    <VerifyButton stale={stale} busy={pending && verifying === i.id} onClick={() => quickVerify(i.id)} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Bulk action bar — sits above the mobile tab bar */}
      {selected.size > 0 && (
        <div className="bg-card fixed inset-x-3 bottom-20 z-40 rounded-xl border p-3 shadow-lg lg:inset-x-auto lg:bottom-6 lg:start-72 lg:end-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{selected.size} נבחרו</span>
            <button type="button" className="text-muted-foreground p-1 text-xs underline" onClick={() => setSelected(new Set())}>
              ניקוי
            </button>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(() => verifyEquipment(ids))}>
                <CheckCheck />
                אומת
              </Button>
              <Select
                aria-label="שיוך מרוכז למחלקה"
                className="h-9 w-40"
                value=""
                disabled={pending}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) run(() => bulkSetPlatoon(ids, v));
                }}
              >
                <option value="">שיוך למחלקה…</option>
                {PLATOONS.map((p) => (
                  <option key={p} value={p}>
                    {PLATOON_LABELS[p]}
                  </option>
                ))}
                <option value="NONE">ללא מחלקה</option>
              </Select>
              <Select
                aria-label="שינוי סטטוס מרוכז"
                className="h-9 w-36"
                value=""
                disabled={pending}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) run(() => bulkSetStatus(ids, v));
                }}
              >
                <option value="">שינוי סטטוס…</option>
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EQUIPMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VerifyButton({
  stale,
  busy,
  onClick,
  compact,
  className,
}: {
  stale: boolean;
  busy: boolean;
  onClick: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={stale ? "outline" : "ghost"}
      size={compact ? "sm" : "icon"}
      onClick={onClick}
      disabled={busy}
      title="סימון כמאומת עכשיו"
      aria-label="סימון כמאומת עכשיו"
      className={cn(stale ? "text-warning-foreground dark:text-warning" : "text-muted-foreground", className)}
    >
      <ShieldCheck />
      {compact && (busy ? "…" : "אומת")}
    </Button>
  );
}


/** "רכיב של …" on components, "+N רכיבים" on items that carry a set. */
function SetMarker({ item, className }: { item: EquipmentListItem; className?: string }) {
  if (item.parent)
    return (
      <Badge variant="outline" className={className} title="רכיב — עובר יחד עם הפריט הראשי">
        <Link2 />
        רכיב של {itemLabel(item.parent)}
      </Badge>
    );
  if (item.setMissing)
    return (
      <Badge variant="warning" className={className} title={`מארז "${item.setName}" חסר: ${item.setMissing}`}>
        <Boxes />
        מארז חסר: {item.setMissing}
      </Badge>
    );
  if (item.setName)
    return (
      <Badge variant="outline" className={className} title="מארז שלם">
        <Boxes />
        {item.setName}
      </Badge>
    );
  if (item._count.components)
    return (
      <Badge variant="outline" className={className} title="פריט עם רכיבים מצורפים">
        <Boxes />+{item._count.components} רכיבים
      </Badge>
    );
  return null;
}
