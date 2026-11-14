import { PLATOON_BADGE_CLASSES, PLATOON_DOT_CLASSES, PLATOON_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Platoon } from "@/generated/prisma/enums";

/** Color-coded platoon label, used in every list so platoons can be told apart at a glance. */
export function PlatoonBadge({ platoon, className }: { platoon: Platoon | null; className?: string }) {
  if (!platoon) return <span className={cn("text-muted-foreground text-xs", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        PLATOON_BADGE_CLASSES[platoon],
        className,
      )}
    >
      {PLATOON_LABELS[platoon]}
    </span>
  );
}

/** Small colored dot — for tight spots like chips and tiles. */
export function PlatoonDot({ platoon, className }: { platoon: Platoon; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", PLATOON_DOT_CLASSES[platoon], className)} />;
}
