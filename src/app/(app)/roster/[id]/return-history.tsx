import Link from "next/link";
import { History } from "lucide-react";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { itemLabel } from "@/lib/equipment-rules";
import { returnGaps } from "@/lib/kit";
import type { SoldierReturnHistory } from "@/lib/queries/soldiers";
import { cn, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * היסטוריית זיכויים: what the soldier signed for and returned, across deployments — kit returns
 * line by line (signed / returned / note) and צל"ם items taken back. The latest kit return is open,
 * older ones are collapsed.
 */
export function ReturnHistory({ history }: { history: SoldierReturnHistory }) {
  const { kitReturns, equipmentReturns } = history;
  if (!kitReturns.length && !equipmentReturns.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> היסטוריית זיכויים
        </CardTitle>
        <CardDescription>על מה הלוחם היה חתום ומה החזיר — לפי זה אפשר להחתים אותו שוב על אותו הציוד</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {kitReturns.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-sm font-semibold">ערכה אישית</h3>
            {kitReturns.map((r, i) => {
              const gaps = returnGaps(r.lines);
              return (
                <details key={r.id} open={i === 0} className="group rounded-md border">
                  <summary className="hover:bg-accent/50 flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="font-medium">ערכה {r.kit.kitNumber}</span>
                    <span className="text-muted-foreground">· {r.kit.deployment.name}</span>
                    <span className={gaps.length ? "text-danger" : "text-success"}>
                      · {gaps.length === 0 ? "הכל חזר" : gaps.length === 1 ? "פער אחד" : `${gaps.length} פערים`}
                    </span>
                    <span className="text-muted-foreground ms-auto text-xs">
                      {formatDateTime(r.createdAt)}
                      {r.performedBy && ` · ${r.performedBy.name}`}
                    </span>
                  </summary>
                  <div className="border-t px-3 py-2">
                    {r.lines.length === 0 ? (
                      <p className="text-muted-foreground text-sm">לא היו פריטים חתומים</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground text-xs">
                          <tr>
                            <th className="py-1 text-start font-medium">פריט</th>
                            <th className="w-14 py-1 text-center font-medium">נחתם</th>
                            <th className="w-14 py-1 text-center font-medium">חזר</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y tabular-nums">
                          {r.lines.map((l, j) => {
                            const short = l.returned < l.expected;
                            return (
                              <tr key={j} className={cn(short && "text-danger")}>
                                <td className="py-1">
                                  {l.label}
                                  {l.note && <span className="text-muted-foreground"> — {l.note}</span>}
                                </td>
                                <td className="py-1 text-center">{l.expected}</td>
                                <td className={cn("py-1 text-center", short && "font-semibold")}>{l.returned}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {r.note && <p className="text-muted-foreground mt-2 text-sm">&quot;{r.note}&quot;</p>}
                  </div>
                </details>
              );
            })}
          </section>
        )}

        {equipmentReturns.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-sm font-semibold">צל&quot;ם שזוכה</h3>
            <ul className="divide-y text-sm">
              {equipmentReturns.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <Link href={`/equipment/${e.item.id}`} className="font-medium hover:underline">
                    {itemLabel(e.item)}
                  </Link>
                  <span className="text-muted-foreground">
                    {e.toSoldier ? `→ ${e.toSoldier.name}` : e.toStatus ? `→ ${EQUIPMENT_STATUS_LABELS[e.toStatus]}` : ""}
                    {e.deployment && ` · ${e.deployment.name}`}
                  </span>
                  <span className="text-muted-foreground ms-auto text-xs">{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
