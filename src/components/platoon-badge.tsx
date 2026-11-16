import { platoonColor, type PlatoonRef } from "@/lib/platoons";
import { cn } from "@/lib/utils";

/**
 * Platoon identity: a colored stripe and the platoon's name. Deliberately not a pill and not a dot —
 * those shapes belong to status (ok / needs attention / missing), and a platoon must never read as one.
 */
export function PlatoonBadge({ platoon, className }: { platoon: PlatoonRef | null | undefined; className?: string }) {
  if (!platoon) return <span className={cn("text-muted-foreground text-xs", className)}>—</span>;
  return (
    <span className={cn("inline-flex w-fit max-w-full items-center gap-1.5 text-sm font-medium whitespace-nowrap", className)}>
      <PlatoonDot platoon={platoon} />
      <span className="truncate">{platoon.name}</span>
    </span>
  );
}

/** The stripe alone — for tight spots like chips and table cells, next to the platoon's name. */
export function PlatoonDot({ platoon, className }: { platoon: Pick<PlatoonRef, "color">; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-4 w-1 shrink-0 rounded-full", platoonColor(platoon.color).stripe, className)} />;
}
