import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.almuraja3a.app',
  appName: 'Almuraja3a',
  // L'export statique Next (BUILD_TARGET=capacitor) est écrit directement
  // dans le distDir .nosync — servi tel quel par la WebView.
  webDir: '.next-capacitor.nosync',
  server: {
    // Schéma https : contexte sécurisé garanti pour getUserMedia (micro de
    // l'exercice Récitation). Ne JAMAIS changer ensuite : le localStorage
    // (progression, stats) est rattaché à l'origine et serait perdu.
    iosScheme: 'https',
  },
  ios: {
    // Pas de scroll/rebond de la WebView elle-même : sensation d'app native,
    // écran FIXE. Les zones défilantes internes (listes) gardent leur scroll CSS.
    scrollEnabled: false,
  },
};

export default config;
