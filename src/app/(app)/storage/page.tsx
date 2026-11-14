import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "ציוד פלוגתי בימ\"ח" };

export default async function Page() {
  return (
    <ModulePlaceholder
      title={"ציוד פלוגתי בימ\"ח"}
      description={"ציוד פלוגתי שאינו משויך אישית"}
      features={["תקן מול מצאי לכל פריט","מעקב תאריכי תפוגה לחסמי עורקים וציוד רפואי","סטטוס: תקין, חוסר, בלאי, פג תוקף"]}
    />
  );
}
