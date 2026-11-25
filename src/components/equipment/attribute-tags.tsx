import { cn } from "@/lib/utils";

/** An item's properties as small tags: "קייס" · "PTT" · "חום"; a missing one ("בלי קייס") in red. */
export function AttributeTags({ tags, className }: { tags: { label: string; missing: boolean }[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {tags.map((t) => (
        <span
          key={t.label}
          className={cn(
            "rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none font-medium",
            t.missing ? "border-danger/40 text-danger" : "text-muted-foreground",
          )}
        >
          {t.label}
        </span>
      ))}
    </span>
  );
}
