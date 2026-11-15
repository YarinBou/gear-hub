import { platoonColor, type PlatoonRef } from "@/lib/platoons";
import { cn } from "@/lib/utils";

/** Color-coded platoon label, used in every list so platoons can be told apart at a glance. */
export function PlatoonBadge({ platoon, className }: { platoon: PlatoonRef | null | undefined; className?: string }) {
  if (!platoon) return <span className={cn("text-muted-foreground text-xs", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        platoonColor(platoon.color).badge,
        className,
      )}
    >
      {platoon.name}
    </span>
  );
}

/** Small colored dot — for tight spots like chips and tiles. */
export function PlatoonDot({ platoon, className }: { platoon: Pick<PlatoonRef, "color">; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", platoonColor(platoon.color).dot, className)} />;
}
