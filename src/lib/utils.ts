import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
const numFmt = new Intl.NumberFormat("he-IL");

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}

const dayMonthFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" });

/** "23.11" — for tight spots like kit tiles. */
export function formatDayMonth(d: Date | null | undefined): string {
  return d ? dayMonthFmt.format(d) : "—";
}

export function formatNumber(n: number): string {
  return numFmt.format(n);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const DAY = 86_400_000;

/** "היום" / "אתמול" / "לפני 5 ימים" — for verification dates in the field. */
export function formatDaysAgo(d: Date | null | undefined): string {
  if (!d) return "מעולם לא";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday.getTime() - d.getTime()) / DAY);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

export function formatDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "—";
}
