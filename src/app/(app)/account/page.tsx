import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PLATOON_LABELS, ROLE_LABELS } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "החשבון שלי" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">החשבון שלי</h1>
      <Card className="gap-1 px-5 py-4 text-sm">
        <p className="text-base font-semibold">{user.name}</p>
        <p className="text-muted-foreground">
          <span className="ltr-text">{user.username}</span> · {ROLE_LABELS[user.role]} ·{" "}
          {user.platoon ? PLATOON_LABELS[user.platoon] : "כל הפלוגה"}
        </p>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>החלפת סיסמה</CardTitle>
          <CardDescription>קיבלתם סיסמה זמנית? החליפו אותה כאן.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
