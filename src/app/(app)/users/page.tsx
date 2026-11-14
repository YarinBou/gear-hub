import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ניהול משתמשים" };

export default async function Page() {
  await requireAdmin();
  return (
    <ModulePlaceholder
      title={"ניהול משתמשים"}
      description={"הרשאות גישה למערכת"}
      features={["הוספה והסרה של משתמשים","תפקיד: מנהל (מ\"פ / סמ\"פ) או משתמש (רס\"פ / מ\"מ)","איפוס סיסמה והשבתת משתמש"]}
    />
  );
}
