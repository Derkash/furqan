import type { MushafPage, PagePair, Verse } from '@/types';
import { toGlobalAyahNumber, parseWordLocation } from './ayahMapping';

/**
 * URLs des APIs
 */
const MUSHAF_CDN =
  'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf';
// CDN Quran Foundation (RECOMMANDÉ) - l'ancien fonts.quran.com peut ne plus fonctionner
const QPC_FONTS_CDN = 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2';
const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio/128/ar.husary';

/**
 * Récupère les données JSON d'une page du Mushaf
 * @param pageNumber - Numéro de page (1-604)
 */
export async function fetchMushafPage(pageNumber: number): Promise<MushafPage> {
  const paddedPage = pageNumber.toString().padStart(3, '0');
  const url = `${MUSHAF_CDN}/page-${paddedPage}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Page ${pageNumber} not found`);
  }

  return response.json();
}

/**
 * Retourne l'URL de la police QPC pour une page
 * @param pageNumber - Numéro de page (1-604)
 */
export function getQPCFontUrl(pageNumber: number): string {
  return `${QPC_FONTS_CDN}/p${pageNumber}.woff2`;
}

/**
 * Retourne l'URL audio pour un verset (Al-Husary)
 * @param globalAyahNumber - Numéro global du verset (1-6236)
 */
export function getAudioUrl(globalAyahNumber: number): string {
  return `${AUDIO_CDN}/${globalAyahNumber}.mp3`;
}

/**
 * Obtenir la paire de pages pour affichage double page RTL
 * @param page - Numéro de page
 * @returns Paire [droite (impaire), gauche (paire)]
 */
export function getPagePair(page: number): PagePair {
  // En RTL: page impaire à droite, page paire à gauche
  const rightPage = page % 2 === 1 ? page : page - 1;
  const leftPage = rightPage + 1;

  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, leftPage),
  };
}

/**
 * Extrait tous les versets uniques d'une page
 * @param pageData - Données de la page
 * @param pageNumber - Numéro de la page
 */
export function extractVersesFromPage(
  pageData: MushafPage,
  pageNumber: number
): Verse[] {
  const versesMap = new Map<string, Verse>();

  for (const line of pageData.lines) {
    if (line.type === 'text' && line.words) {
      for (const word of line.words) {
        const { surah, verse } = parseWordLocation(word.location);
        const key = `${surah}:${verse}`;

        if (!versesMap.has(key)) {
          const globalNumber = toGlobalAyahNumber(surah, verse);
          versesMap.set(key, {
            surah,
            verse,
            globalNumber,
            page: pageNumber,
            text: '', // Le texte complet n'est pas nécessaire pour le quiz
            audioUrl: getAudioUrl(globalNumber),
          });
        }
      }
    }
  }

  // Trier par numéro global pour avoir l'ordre correct
  return Array.from(versesMap.values()).sort(
    (a, b) => a.globalNumber - b.globalNumber
  );
}

/**
 * Obtenir le premier verset d'une page
 */
export function getFirstVerseOfPage(
  pageData: MushafPage,
  pageNumber: number
): Verse | null {
  const verses = extractVersesFromPage(pageData, pageNumber);
  return verses[0] || null;
}

/**
 * Obtenir le dernier verset d'une page
 */
export function getLastVerseOfPage(
  pageData: MushafPage,
  pageNumber: number
): Verse | null {
  const verses = extractVersesFromPage(pageData, pageNumber);
  return verses[verses.length - 1] || null;
}

/**
 * Obtenir un verset aléatoire dans une plage de pages
 * @param pagesData - Map des données de pages chargées
 * @param startPage - Page de début
 * @param endPage - Page de fin
 */
export function getRandomVerseInRange(
  pagesData: Map<number, MushafPage>,
  startPage: number,
  endPage: number
): Verse | null {
  // Collecter tous les versets de la plage
  const allVerses: Verse[] = [];

  for (let page = startPage; page <= endPage; page++) {
    const pageData = pagesData.get(page);
    if (pageData) {
      const verses = extractVersesFromPage(pageData, page);
      allVerses.push(...verses);
    }
  }

  if (allVerses.length === 0) return null;

  // Sélectionner un verset aléatoire
  const randomIndex = Math.floor(Math.random() * allVerses.length);
  return allVerses[randomIndex];
}

/**
 * Précharger les polices QPC pour une plage de pages
 */
export async function preloadFonts(
  startPage: number,
  endPage: number
): Promise<void> {
  const promises = [];

  for (let page = startPage; page <= endPage; page++) {
    const fontUrl = getQPCFontUrl(page);
    const fontName = `QPC-V1-${page}`;

    const font = new FontFace(fontName, `url(${fontUrl})`);
    promises.push(
      font.load().then((loadedFont) => {
        document.fonts.add(loadedFont);
      })
    );
  }

  await Promise.all(promises);
}
