import Link from "next/link";
import { Flag } from "lucide-react";
import { companyContext } from "@/lib/context";
import { Card } from "@/components/ui/card";

// UI side of read-only history. The server refuses writes regardless (writableContext()); these
// just make the page honest about it.

/**
 * Disables every form control inside while a closed deployment is being viewed (and, with
 * `orNone`, while there is no deployment at all). Links keep working.
 */
export async function ReadOnlyWhenClosed({ children, orNone }: { children: React.ReactNode; orNone?: boolean }) {
  const { deployment } = await companyContext();
  const disabled = deployment ? deployment.readOnly : !!orNone;
  if (!disabled) return <>{children}</>;
  return (
    <fieldset disabled className="contents" aria-label="קריאה בלבד — הפעלה שהסתיימה">
      {children}
    </fieldset>
  );
}

/** Shown instead of a page that only makes sense inside a deployment (kits, ammo). */
export function NoDeploymentCard({ what }: { what: string }) {
  return (
    <Card className="mx-auto max-w-xl items-center gap-3 px-6 py-10 text-center">
      <Flag className="text-muted-foreground size-10" />
      <p className="text-lg font-semibold">אין הפעלה פעילה</p>
      <p className="text-muted-foreground text-sm">
        {what} נרשמים בתוך הפעלה. כרגע אין הפעלה פעילה — כל הציוד בנשקייה.
      </p>
      <Link href="/deployments" className="text-primary text-sm font-medium underline">
        למסך ההפעלות
      </Link>
    </Card>
  );
}
