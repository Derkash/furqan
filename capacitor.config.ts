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
};

export default config;
