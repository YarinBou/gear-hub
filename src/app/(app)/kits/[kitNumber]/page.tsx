import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ערכה" };

export default async function KitPage({ params }: PageProps<"/kits/[kitNumber]">) {
  const { kitNumber } = await params;
  return (
    <ModulePlaceholder
      title={`ערכה מס' ${kitNumber}`}
      description={"טופס החתמה ומסדר לערכה בודדת"}
      features={["פרטי הלוחם והנשק האישי","רשימת ציוד עם סימון מהיר","חתימה דיגיטלית","היסטוריית מסדרים"]}
    />
  );
}
