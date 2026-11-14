"use client";

import { useActionState, useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setSoldierActive } from "../actions";

/** Remove from / restore to the roster (soft delete). Two-step confirm without a browser dialog. */
export function ActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(setSoldierActive.bind(null, id, !isActive), undefined);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3">
        {isActive ? (
          confirming ? (
            <form action={action} className="flex flex-col gap-2">
              <p className="text-sm">
                להוציא את הלוחם מהסד&quot;כ? הוא לא יופיע יותר ברשימות הבחירה. ההיסטוריה נשמרת וניתן להחזיר אותו בכל עת.
              </p>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "מעדכן…" : "כן, הוצאה מהסד\"כ"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  ביטול
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" className="text-danger" onClick={() => setConfirming(true)}>
              <UserMinus />
              הוצאה מהסד&quot;כ
            </Button>
          )
        ) : (
          <form action={action}>
            <Button type="submit" variant="outline" className="w-full" disabled={pending}>
              <UserPlus />
              החזרה לסד&quot;כ
            </Button>
          </form>
        )}
        {state?.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
