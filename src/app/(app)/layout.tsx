import { Suspense } from "react";
import Link from "next/link";
import { ShieldHalf } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AppHeader, AppHeaderFallback } from "@/components/layout/app-header";
import { DeploymentBanner } from "@/components/layout/deployment-banner";
import { BottomNav, BottomNavView } from "@/components/layout/bottom-nav";
import { SidebarNav, SidebarNavView } from "@/components/layout/sidebar-nav";
import { isCompanyAdmin } from "@/lib/roles";

// Cache Components: the shell (sidebar frame, bottom nav) prerenders statically;
// everything that reads the session streams in behind <Suspense>.
// Every page also calls requireUser()/requireAdmin() itself — the layout is not an auth gate.

async function UserSidebarNav() {
  const user = await requireUser();
  const isAdmin = isCompanyAdmin(user.role);
  return (
    <Suspense fallback={<SidebarNavView isAdmin={isAdmin} />}>
      <SidebarNav isAdmin={isAdmin} />
    </Suspense>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — sits on the inline-start edge (right side in RTL) */}
      <aside className="bg-card sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-e p-4 lg:flex print:hidden">
        <Link href="/" className="flex items-center gap-2 px-3 pt-2 text-lg font-bold">
          <ShieldHalf className="text-primary size-7" />
          Gear-Hub
        </Link>
        <Suspense fallback={<SidebarNavView isAdmin={false} />}>
          <UserSidebarNav />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
        <Suspense fallback={null}>
          <DeploymentBanner />
        </Suspense>
        {/* Bottom padding leaves room for the mobile tab bar */}
        <main className="flex-1 px-4 pt-4 pb-24 lg:px-6 lg:pt-6 lg:pb-8 print:p-0">{children}</main>
      </div>

      <Suspense fallback={<BottomNavView />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
