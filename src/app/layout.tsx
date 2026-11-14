import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

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
  themeColor: "#4a5d32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
