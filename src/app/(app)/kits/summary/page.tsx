import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { NoDeploymentCard } from "@/components/deployment-gate";
import { getPlatoons } from "@/lib/queries/platoons";
import { getKitSummary } from "@/lib/queries/kits";
import { cn, formatDateTime } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { PrintButton } from "@/components/print-button";
import { PlatoonDot } from "@/components/platoon-badge";
import { KitSummaryTable } from "@/components/kits/kit-summary-table";

export const metadata: Metadata = { title: "סיכום ציוד בערכות" };

/**
 * Totals over the issued kits (סיכום ציוד): how many of each item the soldiers signed for, how
 * many are in the kits, and how many are missing — to compare with what the company signed for.
 * Printable / PDF, optionally for one platoon.
 */
export default async function KitSummaryPage({ searchParams }: PageProps<"/kits/summary">) {
  await connection();
  const { user, deployment } = await companyContext();
  if (!deployment) return <NoDeploymentCard what="סיכום ציוד" />;
  const raw = (await searchParams).platoon;
  const platoons = await getPlatoons();
  const platoon = platoons.find((p) => p.id === (Array.isArray(raw) ? raw[0] : raw));
  const summary = await getKitSummary(platoon?.id);

  const chip = (label: string, to: string, active: boolean, dot?: (typeof platoons)[number]) => (
    <li key={label}>
      <Link
        href={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
        )}
      >
        {dot && <PlatoonDot platoon={dot} />}
        {label}
      </Link>
    </li>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink href="/kits" label="חזרה לערכות" />
        <PrintButton />
      </div>

      <nav aria-label="סינון לפי מחלקה" className="no-scrollbar -mx-4 overflow-x-auto px-4 print:hidden">
        <ul className="flex w-max gap-2">
          {chip("כל הפלוגה", "/kits/summary", !platoon)}
          {platoons
            .filter((p) => p.isActive || p.id === platoon?.id)
            .map((p) => chip(p.name, `/kits/summary?platoon=${p.id}`, platoon?.id === p.id, p))}
        </ul>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold">סיכום ציוד בערכות</h1>
          <p className="text-muted-foreground text-sm">
            {user.companyName}
            {platoon ? ` · ${platoon.name}` : ""} · {deployment.name}
          </p>
          <p className="text-muted-foreground text-sm">
            {summary.kits} ערכות הונפקו · {summary.signedKits} הוחתמו
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums">הופק {formatDateTime(new Date())}</p>
      </header>

      <p className="text-muted-foreground text-xs">
        חתום = סך מה שהלוחמים חתמו עליו (ערכות שהוחתמו). קיים = מה שנמצא בערכות כרגע. חסר = מה שחסר לכל לוחם מול מה שחתם עליו
        (בערכה שעוד לא הוחתמה — מול רשימת הציוד).
      </p>

      <KitSummaryTable summary={summary} />
    </div>
  );
}
