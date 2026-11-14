import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { BackLink } from "@/components/layout/back-link";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "ייבוא מרוכז לסד\"כ" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <BackLink href="/roster" label='חזרה לסד"כ' />
      <div>
        <h1 className="text-2xl font-bold">ייבוא מרוכז לסד&quot;כ</h1>
        <p className="text-muted-foreground text-sm">
          העתיקו שורות מאקסל או מגוגל שיטס והדביקו כאן. לוחמים עם מספר אישי שכבר קיים יידלגו.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
