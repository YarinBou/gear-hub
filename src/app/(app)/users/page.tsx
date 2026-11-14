import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { AddUserForm, UserRow } from "./user-forms";

export const metadata: Metadata = { title: "ניהול משתמשים" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, username: true, role: true, platoon: true, isActive: true },
  });
  const active = users.filter((u) => u.isActive);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
        <p className="text-muted-foreground text-sm">
          {active.length} משתמשים פעילים · {active.filter((u) => u.role === "ADMIN").length} מנהלים
        </p>
      </div>
      <Card className="text-muted-foreground gap-1 px-5 py-3 text-sm">
        <p>
          <span className="text-foreground font-medium">מנהל (מ&quot;פ / סמ&quot;פ):</span> גישה מלאה — קטלוג, משתמשים, מחיקות.
        </p>
        <p>
          <span className="text-foreground font-medium">משתמש (רס&quot;פ / מ&quot;מ):</span> עדכון מלאי, שיוך ציוד ללוחמים, מסדרים
          והחתמות.
        </p>
      </Card>

      <AddUserForm />

      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isMe={u.id === me.id} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
