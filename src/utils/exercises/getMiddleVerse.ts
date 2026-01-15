import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap } from '@/hooks/useVerseMap';

// Constantes du verse-map.json (métadonnées)
const LAYOUT = {
  marginTop: 11.5,
  marginRight: 7,
  lineHeight: 5.5,
  linesPerPage: 15,
  textAreaWidth: 86, // 100 - marginLeft(7) - marginRight(7)
};

// Ligne cible (milieu visuel de la page)
const TARGET_LINE = 8;

// Position en % du CENTRE de la ligne 8 (milieu de la page)
// Centre = top de ligne 8 + moitié de la hauteur de ligne
const TARGET_POSITION = LAYOUT.marginTop + (TARGET_LINE - 1) * LAYOUT.lineHeight + LAYOUT.lineHeight / 2;
// = 11.5 + 7 * 5.5 + 2.75 = 52.75%

/**
 * Calcule la position verticale précise du début d'un verset.
 * Prend en compte la position horizontale sur la ligne (RTL).
 *
 * @param box - Premier box du verset
 * @returns Position verticale en %
 */
function calculateVerseStartPosition(box: { top: number; right: number }): number {
  // top = position verticale du haut de la ligne
  // right = distance depuis le bord droit de la page (en RTL, début de ligne = petit right)

  // Calculer le pourcentage horizontal dans la ligne (0% = début RTL, 100% = fin RTL)
  // right=7% (marge) = début de ligne = 0%
  // right=93% (autre marge) = fin de ligne = 100%
  const horizontalProgress = Math.max(0, (box.right - LAYOUT.marginRight) / LAYOUT.textAreaWidth);

  // Position verticale = top de la ligne + progression horizontale × hauteur de ligne
  // Un verset qui commence tard dans la ligne (grand right) est plus proche de la ligne suivante
  return box.top + horizontalProgress * LAYOUT.lineHeight;
}

/**
 * Trouve le verset dont le début est le plus proche du centre de la ligne 8 (milieu de la page).
 *
 * Utilise les positions précises en % du verse-map.json :
 * - Position verticale (top du premier box)
 * - Position horizontale (right du premier box pour RTL)
 *
 * Le centre de la ligne 8 se situe à environ 52.75% depuis le haut de la page.
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
    let versePosition: number;

    // Si on a les données du verse-map, utiliser la position exacte
    if (verseMapData && verseMapData[verse.verseKey]) {
      const verseEntry = verseMapData[verse.verseKey];
      if (verseEntry.boxes && verseEntry.boxes.length > 0) {
        const firstBox = verseEntry.boxes[0];
        // Calculer la position précise avec la position horizontale
        versePosition = calculateVerseStartPosition(firstBox);
      } else {
        // Fallback: utiliser le centre de la ligne
        const firstLine = Math.min(...verse.lines);
        versePosition = LAYOUT.marginTop + (firstLine - 1) * LAYOUT.lineHeight + LAYOUT.lineHeight / 2;
      }
    } else {
      // Fallback sans verse-map: utiliser le centre de la ligne
      const firstLine = Math.min(...verse.lines);
      versePosition = LAYOUT.marginTop + (firstLine - 1) * LAYOUT.lineHeight + LAYOUT.lineHeight / 2;
    }

    // Calculer la distance avec le centre de la ligne 8 (52.75%)
    const distance = Math.abs(versePosition - TARGET_POSITION);

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

  const targetPosition = LAYOUT.marginTop + (targetLine - 1) * LAYOUT.lineHeight;
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
        verseTopPosition = LAYOUT.marginTop + (firstLine - 1) * LAYOUT.lineHeight;
      }
    } else {
      const firstLine = Math.min(...verse.lines);
      verseTopPosition = LAYOUT.marginTop + (firstLine - 1) * LAYOUT.lineHeight;
    }

    const distance = Math.abs(verseTopPosition - targetPosition);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}
