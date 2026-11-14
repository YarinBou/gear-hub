import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  href,
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  href: string;
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Link href={href} className="group focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]">
      <Card className="group-hover:border-primary/40 h-full gap-2 py-4 transition-colors">
        <CardContent className="flex items-start gap-3 px-4">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              tone === "default" && "bg-primary/10 text-primary",
              tone === "warning" && "bg-warning/20 text-warning-foreground dark:text-warning",
              tone === "danger" && "bg-danger/15 text-danger",
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground truncate text-xs font-medium sm:text-sm">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
          </div>
          <ChevronLeft className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  );
}
