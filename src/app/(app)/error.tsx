"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <AlertTriangle className="text-danger size-10" />
      <h1 className="text-xl font-bold">אירעה שגיאה בטעינת הנתונים</h1>
      <p className="text-muted-foreground text-sm">
        ייתכן שאין חיבור למסד הנתונים. נסו שוב, ואם הבעיה חוזרת פנו למנהל המערכת.
      </p>
      {error.digest && <p className="text-muted-foreground ltr-text text-xs">{error.digest}</p>}
      <Button onClick={reset}>נסו שוב</Button>
    </div>
  );
}
