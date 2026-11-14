import Link from "next/link";
import { companyContext } from "@/lib/context";
import { formatDate } from "@/lib/utils";
import { BackToActiveButton } from "./back-to-active-button";

/** Below the header: says when the app shows a closed deployment (read-only) or none at all. */
export async function DeploymentBanner() {
  const { deployment } = await companyContext();
  if (deployment && !deployment.readOnly) return null;

  if (!deployment) {
    return (
      <div className="bg-muted text-muted-foreground border-b px-4 py-2 text-sm lg:px-6 print:hidden">
        אין הפעלה פעילה — כל הציוד בנשקייה.{" "}
        <Link href="/deployments" className="text-primary font-medium underline">
          מסך ההפעלות
        </Link>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="border-warning/60 bg-warning/15 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm lg:px-6 print:hidden"
    >
      <span>
        צופים בהפעלה שהסתיימה: <strong>{deployment.name}</strong> ({formatDate(deployment.startedAt)} –{" "}
        {formatDate(deployment.endedAt)}). <strong>קריאה בלבד.</strong>
      </span>
      <BackToActiveButton />
    </div>
  );
}
