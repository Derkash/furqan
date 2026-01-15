import type { PageVerses, VersePosition } from '@/types';

const TARGET_LINE = 8;

/**
 * Trouve le verset dont le début est le plus proche de la ligne 8 (milieu de la page).
 *
 * Algorithme :
 * 1. Pour chaque verset, obtenir la première ligne qu'il occupe
 * 2. Calculer la distance avec la ligne 8
 * 3. Retourner le verset avec la distance minimale
 *
 * @param pageVerses - Données PageVerses pour une page
 * @returns Le verset commençant le plus proche de la ligne 8, ou null
 */
export function getMiddleVerse(pageVerses: PageVerses | null): VersePosition | null {
  if (!pageVerses?.verses || pageVerses.verses.length === 0) {
    return null;
  }

  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    // Obtenir la première ligne de ce verset
    const firstLine = Math.min(...verse.lines);

    // Calculer la distance avec la ligne cible
    const distance = Math.abs(firstLine - TARGET_LINE);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }

    // Si on trouve un verset commençant exactement à la ligne 8, retourner immédiatement
    if (distance === 0) {
      return verse;
    }
  }

  return closestVerse;
}

/**
 * Variante avec ligne cible configurable
 */
export function getMiddleVerseAtLine(
  pageVerses: PageVerses | null,
  targetLine: number = TARGET_LINE
): VersePosition | null {
  if (!pageVerses?.verses || pageVerses.verses.length === 0) {
    return null;
  }

  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    const firstLine = Math.min(...verse.lines);
    const distance = Math.abs(firstLine - targetLine);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}
