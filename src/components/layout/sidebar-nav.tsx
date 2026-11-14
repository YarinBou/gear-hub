"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Hook-free render; used directly as the Suspense fallback (no active highlight). */
export function SidebarNavView({ isAdmin, pathname }: { isAdmin: boolean; pathname?: string }) {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const main = items.filter((i) => !i.adminOnly);
  const admin = items.filter((i) => i.adminOnly);

  const renderItem = (item: (typeof items)[number]) => {
    const active = pathname ? isActive(pathname, item.href) : false;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
            active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="flex flex-col gap-6" aria-label="ניווט ראשי">
      <ul className="flex flex-col gap-1">{main.map(renderItem)}</ul>
      {admin.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold">ניהול</p>
          <ul className="flex flex-col gap-1">{admin.map(renderItem)}</ul>
        </div>
      )}
    </nav>
  );
}

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  return <SidebarNavView isAdmin={isAdmin} pathname={usePathname()} />;
}
