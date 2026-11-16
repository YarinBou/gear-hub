import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { VercelInsights } from "@/components/vercel-insights";
import { THEME_SCRIPT } from "@/lib/theme";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: { default: "Gear-Hub | ניהול לוגיסטי פלוגתי", template: "%s | Gear-Hub" },
  description: 'מערכת לניהול צל"ם, תחמושת, ציוד אישי וציוד פלוגתי',
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches --background in globals.css for each theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#11130d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script below may add "dark" to <html> before React hydrates.
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <VercelInsights />
      </body>
    </html>
  );
}
