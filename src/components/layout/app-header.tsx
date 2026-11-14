import Link from "next/link";
import { Building2, LogOut, ShieldHalf } from "lucide-react";
import { leaveCompany } from "@/app/admin/companies/actions";
import { logout } from "@/app/login/actions";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { DeploymentPicker } from "@/components/layout/deployment-picker";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/global-search";
import { ROLE_LABELS } from "@/lib/constants";

function HeaderFrame({ children }: { children?: React.ReactNode }) {
  return (
    <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur print:hidden">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold lg:hidden">
          <ShieldHalf className="text-primary size-6" />
          <span className="sr-only sm:not-sr-only">Gear-Hub</span>
        </Link>
        <div className="max-w-xl flex-1">
          <GlobalSearch />
        </div>
        <div className="ms-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}

export function AppHeaderFallback() {
  return <HeaderFrame />;
}

export async function AppHeader() {
  const { user, deployment } = await companyContext();
  const deployments = await scopedDb(user.companyId).deployment.findMany({
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    take: 30,
    select: { id: true, name: true, status: true },
  });
  return (
    <HeaderFrame>
      <DeploymentPicker
        options={deployments.map((d) => ({ id: d.id, name: d.name, active: d.status === "ACTIVE" }))}
        viewedId={deployment?.id ?? null}
      />
      {user.role === "SUPER_ADMIN" ? (
        // Super-admin working inside a company: show which one, and a way back to the company list.
        <form action={leaveCompany}>
          <Button variant="outline" size="sm" type="submit" title="החלפת פלוגה">
            <Building2 />
            <span className="max-w-32 truncate">{user.companyName}</span>
          </Button>
        </form>
      ) : (
        <span className="text-muted-foreground hidden max-w-40 truncate text-sm md:block">{user.companyName}</span>
      )}
      <Link href="/account" className="hover:bg-accent hidden rounded-md px-2 py-1 text-end leading-tight sm:block" title="החשבון שלי">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-muted-foreground text-xs">{ROLE_LABELS[user.role]}</p>
      </Link>
      <form action={logout}>
        <Button variant="ghost" size="icon" type="submit" aria-label="התנתקות" title="התנתקות">
          <LogOut className="size-5 rtl:-scale-x-100" />
        </Button>
      </form>
    </HeaderFrame>
  );
}
