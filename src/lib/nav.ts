import {
  Backpack,
  Boxes,
  ClipboardList,
  Crosshair,
  Flag,
  LayoutDashboard,
  Package,
  Rows3,
  Tags,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Shown in the mobile bottom bar (max 4 + "עוד"). */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "לוח בקרה", shortLabel: "ראשי", icon: LayoutDashboard, mobile: true },
  { href: "/roster", label: 'סד"כ פלוגתי', shortLabel: 'סד"כ', icon: Users, mobile: true },
  { href: "/equipment", label: 'צל"ם', icon: Crosshair, mobile: true },
  { href: "/kits", label: "ציוד אישי והחתמות", shortLabel: "ערכות", icon: Backpack, mobile: true },
  { href: "/ammo", label: "תחמושת", icon: Boxes },
  { href: "/storage", label: 'ציוד פלוגתי בימ"ח', shortLabel: 'בימ"ח', icon: Warehouse },
  { href: "/deployments", label: "הפעלות", icon: Flag },
  { href: "/catalog", label: "קטלוג ציוד", icon: Tags, adminOnly: true },
  { href: "/catalog/sets", label: "מארזים", icon: Package, adminOnly: true },
  { href: "/kits/items", label: "תכולת ערכה", icon: ClipboardList, adminOnly: true },
  { href: "/platoons", label: "מחלקות", icon: Rows3, adminOnly: true },
  { href: "/users", label: "ניהול משתמשים", icon: UserCog, adminOnly: true },
];

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item for this path — the most specific one (on /kits/items, "תכולת ערכה", not "ערכות"). */
export function isActive(pathname: string, href: string) {
  if (!matches(pathname, href)) return false;
  return !NAV_ITEMS.some((o) => o.href !== href && o.href.startsWith(`${href}/`) && matches(pathname, o.href));
}
