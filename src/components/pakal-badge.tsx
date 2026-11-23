import { Star } from "lucide-react";
import { platoonColor } from "@/lib/platoons";
import { cn } from "@/lib/utils";

/**
 * תיק פק"ל mark: a solid dark tag with a star and the role's name (e.g. נגביסט). Deliberately unlike
 * the platoon stripe and the status pills, so a פק"ל kit stands out at a glance in the kits grid.
 * The small swatch tells פק"לים apart.
 */
export function PakalBadge({ pakal, className }: { pakal: { name: string; color: number } | null | undefined; className?: string }) {
  if (!pakal) return null;
  return (
    <span
      className={cn(
        "bg-foreground text-background inline-flex w-fit max-w-full items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs font-bold whitespace-nowrap",
        className,
      )}
    >
      <Star className="size-3 shrink-0 fill-current" aria-hidden />
      <span className="truncate">{pakal.name}</span>
      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-[2px]", platoonColor(pakal.color).stripe)} />
    </span>
  );
}
