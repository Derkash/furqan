import type { Metadata, Viewport } from "next";
import AppInit from "@/components/AppInit";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://almuraja3a.com"),
  title: "Al-Muraja3a — Révision du Coran",
  description: "Application de révision et mémorisation du Coran avec Mushaf Medina (QCF V1) et audio Al-Husary",
  keywords: ["Quran", "Coran", "Mushaf", "Mémorisation", "Hifz", "Al-Husary", "Mouraja3a"],
  authors: [{ name: "Abdoul-khader" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Nécessaire pour que env(safe-area-inset-*) soit renseigné dans l'app iPad
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <AppInit />
        {children}
      </body>
    </html>
  );
}
