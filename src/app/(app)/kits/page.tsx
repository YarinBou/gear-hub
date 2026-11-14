import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ציוד אישי והחתמות" };

export default async function Page() {
  return (
    <ModulePlaceholder
      title={"ציוד אישי והחתמות"}
      description={"98 ערכות לחימה אישיות וטופס החתמה דיגיטלי"}
      features={["טופס החתמה דיגיטלי ללוחם","מפת כשירות ערכות 1–98","סימון מהיר נמצא / חסר במסדרים"]}
    />
  );
}
