"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Mobile bottom tab bar — large tap targets for field use. Hook-free; doubles as Suspense fallback. */
export function BottomNavView({ pathname }: { pathname?: string }) {
  const items = NAV_ITEMS.filter((i) => i.mobile);
  const moreActive =
    !!pathname && (pathname === "/more" || !items.some((i) => isActive(pathname, i.href)));

  const tab = (href: string, label: string, Icon: typeof Menu, active: boolean) => (
    <li key={href} className="flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className={cn("size-5", active && "stroke-[2.5]")} />
        {label}
      </Link>
    </li>
  );

  return (
    <nav
      aria-label="ניווט תחתון"
      className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden print:hidden"
    >
      <ul className="flex">
        {items.map((i) =>
          tab(i.href, i.shortLabel ?? i.label, i.icon, pathname ? isActive(pathname, i.href) : false),
        )}
        {tab("/more", "עוד", Menu, moreActive)}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}
