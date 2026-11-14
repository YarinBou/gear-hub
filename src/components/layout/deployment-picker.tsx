"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { viewDeployment } from "@/app/(app)/deployments/actions";
import { cn } from "@/lib/utils";

export type DeploymentOption = { id: string; name: string; active: boolean };

/** Header dropdown: which deployment (הפעלה) the whole app shows. */
export function DeploymentPicker({ options, viewedId }: { options: DeploymentOption[]; viewedId: string | null }) {
  const [pending, start] = useTransition();
  if (!options.length) {
    return (
      <Link href="/deployments" className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-md px-2 py-1 text-sm">
        <Flag className="size-4" />
        <span className="hidden sm:inline">אין הפעלה</span>
      </Link>
    );
  }
  const viewed = options.find((o) => o.id === viewedId);
  return (
    <label className={cn("flex items-center gap-1", pending && "opacity-60")}>
      <Flag className={cn("size-4 shrink-0", viewed?.active ? "text-primary" : "text-muted-foreground")} />
      <span className="sr-only">הפעלה מוצגת</span>
      <select
        className="bg-card h-9 max-w-36 rounded-md border px-2 text-sm sm:max-w-48"
        value={viewedId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          const target = options.find((o) => o.id === id);
          // Picking the active deployment clears the choice, so it follows whatever is active next.
          start(() => viewDeployment(target?.active ? null : id || null));
        }}
      >
        {!viewedId && <option value="">אין הפעלה פעילה</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.active ? `${o.name} (פעילה)` : `${o.name} — היסטוריה`}
          </option>
        ))}
      </select>
    </label>
  );
}
