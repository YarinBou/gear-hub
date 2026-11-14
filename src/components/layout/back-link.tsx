import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm">
      {/* "Back" points right in RTL */}
      <ChevronRight className="size-4" />
      {label}
    </Link>
  );
}
