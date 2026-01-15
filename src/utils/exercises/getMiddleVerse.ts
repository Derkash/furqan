import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap, VerseMapEntry } from '@/hooks/useVerseMap';

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
 * Trouve le verset dont le début est le plus proche de la ligne 8 (milieu de la page).
 *
 * Utilise les positions précises en % du verse-map.json (valeur `top` du premier box).
 * La ligne 8 se situe à environ 47.9% depuis le haut de la page.
 *
 * @param pageVerses - Données PageVerses pour une page
 * @param verseMapData - Données du verse-map pour cette page (optionnel mais recommandé)
 * @returns Le verset commençant le plus proche de la ligne 8, ou null
 */
export function getMiddleVerse(
  pageVerses: PageVerses | null,
  verseMapData?: PageVerseMap | null
): VersePosition | null {
  if (!pageVerses?.verses || pageVerses.verses.length === 0) {
    return null;
  }

  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    let verseTopPosition: number;

    // Si on a les données du verse-map, utiliser la position exacte du premier box
    if (verseMapData && verseMapData[verse.verseKey]) {
      const verseEntry = verseMapData[verse.verseKey];
      if (verseEntry.boxes && verseEntry.boxes.length > 0) {
        // Le premier box donne la position exacte où le verset commence
        verseTopPosition = verseEntry.boxes[0].top;
      } else {
        // Fallback: calculer depuis le numéro de ligne
        const firstLine = Math.min(...verse.lines);
        verseTopPosition = CALIBRATION.marginTop + (firstLine - 1) * CALIBRATION.lineHeight;
      }
    } else {
      // Fallback sans verse-map: calculer depuis le numéro de ligne
      const firstLine = Math.min(...verse.lines);
      verseTopPosition = CALIBRATION.marginTop + (firstLine - 1) * CALIBRATION.lineHeight;
    }

    // Calculer la distance avec la position cible (ligne 8 ≈ 47.9%)
    const distance = Math.abs(verseTopPosition - TARGET_POSITION);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}

/**
 * Variante avec ligne cible configurable
 */
export function getMiddleVerseAtLine(
  pageVerses: PageVerses | null,
  targetLine: number = TARGET_LINE,
  verseMapData?: PageVerseMap | null
): VersePosition | null {
  if (!pageVerses?.verses || pageVerses.verses.length === 0) {
    return null;
  }

  const targetPosition = CALIBRATION.marginTop + (targetLine - 1) * CALIBRATION.lineHeight;
  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    let verseTopPosition: number;

    if (verseMapData && verseMapData[verse.verseKey]) {
      const verseEntry = verseMapData[verse.verseKey];
      if (verseEntry.boxes && verseEntry.boxes.length > 0) {
        verseTopPosition = verseEntry.boxes[0].top;
      } else {
        const firstLine = Math.min(...verse.lines);
        verseTopPosition = CALIBRATION.marginTop + (firstLine - 1) * CALIBRATION.lineHeight;
      }
    } else {
      const firstLine = Math.min(...verse.lines);
      verseTopPosition = CALIBRATION.marginTop + (firstLine - 1) * CALIBRATION.lineHeight;
    }

    const distance = Math.abs(verseTopPosition - targetPosition);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}
