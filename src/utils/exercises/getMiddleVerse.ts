import type { PageVerses, VersePosition } from '@/types';

// Constantes de calibration (identiques à MushafPage.tsx)
const CALIBRATION = {
  marginTop: 12.2,
  lineHeight: 5.10,
  linesPerPage: 15,
};

// Ligne cible (milieu visuel de la page)
const TARGET_LINE = 8;

// Position en % de la ligne 8 (milieu de la page)
const TARGET_POSITION = CALIBRATION.marginTop + (TARGET_LINE - 1) * CALIBRATION.lineHeight;

/**
 * Calcule la position verticale (%) du début d'une ligne
 */
function getLinePosition(lineNumber: number): number {
  return CALIBRATION.marginTop + (lineNumber - 1) * CALIBRATION.lineHeight;
}

/**
 * Trouve le verset dont le début est le plus proche de la ligne 8 (milieu de la page).
 *
 * Utilise les positions réelles en % basées sur le tableau de calibration.
 * La ligne 8 se situe à environ 47.9% depuis le haut de la page.
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

    // Calculer la position réelle en %
    const versePosition = getLinePosition(firstLine);

    // Calculer la distance avec la position cible
    const distance = Math.abs(versePosition - TARGET_POSITION);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }

    // Si on trouve un verset commençant exactement à la ligne 8
    if (firstLine === TARGET_LINE) {
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

  const targetPosition = getLinePosition(targetLine);
  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    const firstLine = Math.min(...verse.lines);
    const versePosition = getLinePosition(firstLine);
    const distance = Math.abs(versePosition - targetPosition);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}
