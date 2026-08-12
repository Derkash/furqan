import type { NextConfig } from "next";

// Deux cibles de build, un seul code :
// - web (défaut)            : build serveur classique, déployé sur Vercel,
//                             API routes actives (fichiers route.api.ts).
// - app iPad (BUILD_TARGET=capacitor) : export 100 % statique embarqué dans la
//                             coque Capacitor. Les API routes sont exclues du
//                             build (pageExtensions sans « api.ts ») ; les
//                             fonctionnalités serveur passent alors par
//                             https://almuraja3a.com via apiUrl().
const isCapacitorBuild = process.env.BUILD_TARGET === "capacitor";

const nextConfig: NextConfig = {
  // Le suffixe .nosync empêche iCloud Drive de synchroniser le dossier de build
  // (le projet vit dans iCloud) : évite les builds corrompus (ENOTEMPTY), les
  // fichiers dupliqués « 2 » et les gros ralentissements de synchro.
  // UNIQUEMENT en local : le builder Vercel exige le dossier standard .next.
  ...(process.env.VERCEL
    ? {}
    : { distDir: isCapacitorBuild ? ".next-capacitor.nosync" : ".next.nosync" }),
  pageExtensions: isCapacitorBuild
    ? ["ts", "tsx"]
    : ["api.ts", "ts", "tsx"],
  ...(isCapacitorBuild
    ? {
        output: "export" as const,
        // Dossiers page/index.html : requis pour que la WebView Capacitor
        // serve les URL profondes (/exercises/…) depuis le système de fichiers.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
