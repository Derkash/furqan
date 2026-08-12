/**
 * Préfixe des appels aux API routes (/api/*).
 *
 * - Site web : chaîne vide → appels relatifs vers le même déploiement Vercel.
 * - App iPad (build Capacitor, export statique sans serveur) :
 *   NEXT_PUBLIC_API_BASE_URL=https://almuraja3a.com → les fonctionnalités
 *   serveur (vocab, TTS, tafsir) passent par le site quand l'iPad est en ligne,
 *   et échouent proprement hors ligne (les exercices n'en dépendent pas).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
