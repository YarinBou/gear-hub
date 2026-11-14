import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ניהול סד\"כ פלוגתי" };

export default async function Page() {
  return (
    <ModulePlaceholder
      title={"ניהול סד\"כ פלוגתי"}
      description={"מקור אמת יחיד לכל לוחמי הפלוגה"}
      features={["הוספת לוחם בודד והוספה מרוכזת (הדבקה מאקסל)","שיוך לוחם למחלקה","הלוחמים זמינים בכל רשימות הבחירה במערכת"]}
    />
  );
}
