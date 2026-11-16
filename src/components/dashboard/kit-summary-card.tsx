import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KitSummaryTable } from "@/components/kits/kit-summary-table";
import type { KitSummary } from "@/lib/queries/kits";

/** Dashboard: totals of every kit item (signed for / there / missing), linking to the full report. */
export function KitSummaryCard({ summary }: { summary: KitSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>סיכום ציוד בערכות</CardTitle>
          <CardDescription>
            {summary.kits} ערכות הונפקו · {summary.signedKits} הוחתמו
          </CardDescription>
        </div>
        <Link href="/kits/summary" className="text-primary shrink-0 text-sm font-medium hover:underline">
          לדוח המלא
        </Link>
      </CardHeader>
      <CardContent>
        <KitSummaryTable summary={summary} compact />
      </CardContent>
    </Card>
  );
}
