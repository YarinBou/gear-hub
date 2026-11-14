import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ניהול תחמושת" };

export default async function Page() {
  return (
    <ModulePlaceholder
      title={"ניהול תחמושת"}
      description={"מעקב מצטבר לפי סוג ומיקום — נפיצה, אלפ\"ה ורגילה"}
      features={["עדכון ספירות לפי מיקום","תאריך ספירה אחרון","התראת מלאי נמוך לפי סף מינימום שהוגדר בקטלוג"]}
    />
  );
}
