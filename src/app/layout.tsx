import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlFourqan - Révision du Coran",
  description: "Application de révision et mémorisation du Coran avec Mushaf Medina 1405H et audio Al-Husary",
  keywords: ["Quran", "Coran", "Mushaf", "Mémorisation", "Hifz", "Al-Husary"],
  authors: [{ name: "Abdoul-khader" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
