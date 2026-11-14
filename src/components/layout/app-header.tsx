import Link from "next/link";
import { LogOut, ShieldHalf } from "lucide-react";
import { logout } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
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
  const user = await requireUser();
  return (
    <HeaderFrame>
      <div className="hidden text-end leading-tight sm:block">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-muted-foreground text-xs">{ROLE_LABELS[user.role]}</p>
      </div>
      <form action={logout}>
        <Button variant="ghost" size="icon" type="submit" aria-label="התנתקות" title="התנתקות">
          <LogOut className="size-5 rtl:-scale-x-100" />
        </Button>
      </form>
    </HeaderFrame>
  );
}
