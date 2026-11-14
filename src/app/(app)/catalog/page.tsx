import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "קטלוג ציוד" };

export default async function Page() {
  await requireAdmin();
  return (
    <ModulePlaceholder
      title={"קטלוג ציוד"}
      description={"ניהול גלובלי של סוגי צל\"ם, תחמושת וציוד בימ\"ח"}
      features={["הוספה, עריכה והשבתה של סוגים","הגדרת סף מינימום לתחמושת","סימון פריטים הדורשים מעקב תוקף"]}
    />
  );
}
