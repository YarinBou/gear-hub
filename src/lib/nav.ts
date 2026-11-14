import {
  Backpack,
  Boxes,
  Crosshair,
  LayoutDashboard,
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
  { href: "/catalog", label: "קטלוג ציוד", icon: Tags, adminOnly: true },
  { href: "/users", label: "ניהול משתמשים", icon: UserCog, adminOnly: true },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
