import type { Metadata } from "next";
import { Backpack, Boxes, Crosshair, Users, Warehouse } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { KitReadinessGrid } from "@/components/dashboard/kit-readiness-grid";
import { PlatoonBreakdown } from "@/components/dashboard/platoon-breakdown";
import { EquipmentStatusCard } from "@/components/dashboard/equipment-status";

export const metadata: Metadata = { title: "לוח בקרה" };

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:gap-6">
      <div>
        <h1 className="text-2xl font-bold">שלום, {user.name}</h1>
        <p className="text-muted-foreground text-sm">תמונת מצב לוגיסטית פלוגתית</p>
      </div>

      <section aria-label="מדדים עיקריים" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard href="/roster" title='סד"כ פעיל' value={formatNumber(data.roster.total)} hint="לוחמים" icon={Users} />
        <StatCard
          href="/equipment"
          title='צל"ם'
          value={formatNumber(data.equipment.total)}
          hint={data.equipment.staleCount ? `${data.equipment.staleCount} לא אומתו` : "כולם אומתו"}
          icon={Crosshair}
          tone={data.equipment.staleCount ? "warning" : "default"}
        />
        <StatCard
          href="/kits"
          title="כשירות ערכות"
          value={`${data.kits.avgReadiness}%`}
          hint={`${data.kits.fullKits} ערכות מלאות`}
          icon={Backpack}
          tone={data.kits.avgReadiness < 75 && data.kits.issued > 0 ? "warning" : "default"}
        />
        <StatCard
          href="/ammo"
          title="תחמושת"
          value={formatNumber(data.ammo.types.length)}
          hint={data.ammo.low.length ? `${data.ammo.low.length} מתחת לסף` : "סוגי תחמושת"}
          icon={Boxes}
          tone={data.ammo.low.length ? "danger" : "default"}
        />
        <StatCard
          href="/storage"
          title='בימ"ח'
          value={`${data.storage.fillRate}%`}
          hint="מצאי מול תקן"
          icon={Warehouse}
          tone={data.storage.shortages.length || data.storage.expiring.length ? "warning" : "default"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-span-2 lg:gap-6">
          <KitReadinessGrid kits={data.kits} />
          <PlatoonBreakdown data={data} />
        </div>
        <div className="flex flex-col gap-4 lg:gap-6">
          <AlertsPanel data={data} />
          <EquipmentStatusCard equipment={data.equipment} />
        </div>
      </div>
    </div>
  );
}
