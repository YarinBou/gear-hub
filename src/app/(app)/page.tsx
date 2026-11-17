import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getKitSummary } from "@/lib/queries/kits";
import { KitSummaryCard } from "@/components/dashboard/kit-summary-card";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { CompanyStatus } from "@/components/dashboard/company-status";
import { KitReadinessGrid } from "@/components/dashboard/kit-readiness-grid";
import { PlatoonBreakdown } from "@/components/dashboard/platoon-breakdown";
import { EquipmentStatusCard } from "@/components/dashboard/equipment-status";

export const metadata: Metadata = { title: "לוח בקרה" };

/**
 * "What needs my attention right now?" first. On a phone: what needs attention, then the company in
 * five lines, then detail. The 98-kit map and the kit-totals table are desktop-only here; on a phone
 * they are one tap away (/kits, /kits/summary).
 */
export default async function DashboardPage() {
  await requireUser();
  const [data, kitSummary] = await Promise.all([getDashboardData(), getKitSummary()]);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
      {/* Placed in the side column on desktop, but first in reading order everywhere. */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-3 lg:row-start-1">
        <AlertsPanel data={data} />
        <CompanyStatus data={data} />
        <EquipmentStatusCard equipment={data.equipment} />
      </div>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <div className="hidden lg:block">
          <KitReadinessGrid kits={data.kits} />
        </div>
        <PlatoonBreakdown data={data} />
        <div className="hidden lg:block">
          <KitSummaryCard summary={kitSummary} />
        </div>
      </div>
    </div>
  );
}
