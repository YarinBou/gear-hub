import { NO_SERIAL_LABEL } from "@/lib/equipment-rules";
import { cn } from "@/lib/utils";

/** A serial number (LTR, monospace) — or a clear "ללא צ" marker when it hasn't been recorded yet. */
export function Serial({ value, className }: { value: string | null; className?: string }) {
  if (value) return <span className={cn("ltr-text font-mono", className)}>{value}</span>;
  return (
    <span
      className={cn(
        "border-warning/60 text-warning-foreground dark:text-warning inline-flex items-center rounded border border-dashed px-1.5 text-xs font-medium",
        className,
      )}
      title="מספר צ / מס״ט טרם נרשם"
    >
      {NO_SERIAL_LABEL}
    </span>
  );
}
