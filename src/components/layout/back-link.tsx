import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    // min-h-11: a 44px tap target; the negative margin keeps the page's vertical rhythm.
    <Link href={href} className="text-muted-foreground hover:text-foreground -my-2 flex min-h-11 w-fit items-center gap-1 text-sm">
      {/* "Back" points right in RTL */}
      <ChevronRight className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
