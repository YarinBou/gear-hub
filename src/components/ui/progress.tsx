import * as React from "react";
import { cn } from "@/lib/utils";

// RTL-safe progress bar: width-based so it fills from the inline-start edge
// (right side in Hebrew). Radix's translateX approach fills from the wrong side under dir="rtl".
function Progress({
  className,
  indicatorClassName,
  value = 0,
  ...props
}: React.ComponentProps<"div"> & { value?: number; indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      data-slot="progress"
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("bg-primary h-full rounded-full transition-[width]", indicatorClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export { Progress };
