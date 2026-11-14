import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ניהול צל\"ם" };

export default async function Page() {
  return (
    <ModulePlaceholder
      title={"ניהול צל\"ם"}
      description={"פריטים ממוספרים: נשק, אופטיקה, רחפנים ואמצעי קשר"}
      features={["סטטוסים: בנשקייה, אצל לוחם, בתיקון, מאופסן, חסר","שיוך ללוחם — המחלקה מתמלאת אוטומטית","שיוך מרוכז למחלקות","התראה על פריטים שלא אומתו מעל 7 ימים","יומן העברות דיגיטלי לכל פריט"]}
    />
  );
}
