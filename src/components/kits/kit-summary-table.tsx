import { groupLines, type KitSummaryLine } from "@/lib/kit";
import type { KitSummary } from "@/lib/queries/kits";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Totals per checklist line over the kits: signed for / in the kits / missing. Used on the kits
 * summary page (grouped, for print) and on the dashboard (compact).
 */
export function KitSummaryTable({ summary, compact = false }: { summary: KitSummary; compact?: boolean }) {
  const extra: KitSummaryLine[] = [
    { itemId: "_weapons", label: "נשק אישי מקושר", groupName: "", sortOrder: 0, signed: 0, have: summary.weapons, missing: 0 },
    { itemId: "_magazines", label: "מחסניות (כרטיס נשק)", groupName: "", sortOrder: 0, signed: 0, have: summary.magazines, missing: 0 },
    { itemId: "_rounds", label: "כדורים (כרטיס נשק)", groupName: "", sortOrder: 0, signed: 0, have: summary.rounds, missing: 0 },
  ].filter((r) => r.have > 0);

  const head = (
    <thead className="text-muted-foreground border-b text-xs">
      <tr>
        <th className={cn("text-start font-medium", compact ? "py-1.5" : "px-4 py-2")}>פריט</th>
        <th className={cn("w-20 text-center font-medium", compact ? "py-1.5" : "px-2 py-2")}>חתום</th>
        <th className={cn("w-20 text-center font-medium", compact ? "py-1.5" : "px-2 py-2")}>קיים</th>
        <th className={cn("w-20 text-center font-medium", compact ? "py-1.5" : "px-2 py-2")}>חסר</th>
      </tr>
    </thead>
  );
  const row = (l: KitSummaryLine, weaponCard = false) => (
    <tr key={l.itemId}>
      <td className={compact ? "py-1.5" : "px-4 py-2"}>{l.label}</td>
      <td className="text-center">{weaponCard ? "—" : formatNumber(l.signed)}</td>
      <td className="text-center">{formatNumber(l.have)}</td>
      <td className={cn("text-center", l.missing > 0 && "text-danger font-semibold")}>{weaponCard ? "—" : l.missing ? formatNumber(l.missing) : "—"}</td>
    </tr>
  );

  if (!summary.lines.length && !extra.length) {
    return <p className="text-muted-foreground py-6 text-center text-sm">אין ערכות שהונפקו</p>;
  }

  if (compact) {
    return (
      <table className="w-full text-sm">
        {head}
        <tbody className="divide-y tabular-nums">
          {summary.lines.map((l) => row(l))}
          {extra.map((l) => row(l, true))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groupLines(summary.lines).map((g) => (
        <section key={g.groupName} className="bg-card break-inside-avoid overflow-hidden rounded-xl border print:rounded-none">
          <h2 className="bg-muted px-4 py-2 font-semibold">{g.groupName}</h2>
          <table className="w-full text-sm">
            {head}
            <tbody className="divide-y tabular-nums">{g.lines.map((l) => row(l))}</tbody>
          </table>
        </section>
      ))}
      {extra.length > 0 && (
        <section className="bg-card break-inside-avoid overflow-hidden rounded-xl border print:rounded-none">
          <h2 className="bg-muted px-4 py-2 font-semibold">כרטיס נשק</h2>
          <table className="w-full text-sm">
            {head}
            <tbody className="divide-y tabular-nums">{extra.map((l) => row(l, true))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
