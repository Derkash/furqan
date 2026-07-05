import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le suffixe .nosync empêche iCloud Drive de synchroniser le dossier de build
  // (le projet vit dans iCloud) : évite les builds corrompus (ENOTEMPTY), les
  // fichiers dupliqués « 2 » et les gros ralentissements de synchro.
  distDir: ".next.nosync",
};

export default nextConfig;
