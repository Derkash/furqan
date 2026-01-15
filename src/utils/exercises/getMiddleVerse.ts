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

// Position cible = centre de la ligne 8 = 8.5 (en unité de lignes)
const TARGET_POSITION = TARGET_LINE + 0.5;

/**
 * Calcule la position effective du début d'un verset en unité de lignes.
 * Combine le numéro de ligne + la progression horizontale (0-1).
 *
 * @param line - Numéro de ligne (1-15)
 * @param right - Position depuis le bord droit (%) du verse-map
 * @returns Position effective en lignes (ex: 7.667 = ligne 7 à 66.7%)
 */
function calculateEffectiveLinePosition(line: number, right: number): number {
  // Calculer le pourcentage horizontal dans la ligne (0 = début RTL, 1 = fin RTL)
  // right=7% (marge) = début de ligne = 0
  // right=93% (autre marge) = fin de ligne = 1
  const horizontalProgress = Math.max(0, Math.min(1, (right - LAYOUT.marginRight) / LAYOUT.textAreaWidth));

  // Position = ligne + progression horizontale
  // Un verset qui commence tard dans la ligne (grand right) est plus proche de la ligne suivante
  return line + horizontalProgress;
}

/**
 * Trouve le verset dont le début est le plus proche du centre de la ligne 8 (milieu de la page).
 *
 * Utilise les positions précises du verse-map.json :
 * - Numéro de ligne (1-15)
 * - Position horizontale (right du premier box pour RTL)
 *
 * Position effective = ligne + (progression horizontale de 0 à 1)
 * Le centre de la ligne 8 = 8.5 (milieu de la ligne 8)
 *
 * Exemple page 3:
 * - Verset 2:11 : ligne 7, right=64.33% → position = 7 + 0.667 = 7.667 → distance = 0.833
 * - Verset 2:12 : ligne 9, right=7% → position = 9 + 0 = 9.0 → distance = 0.5
 * → Verset 2:12 est plus proche du milieu (8.5)
 *
 * @param pageVerses - Données PageVerses pour une page
 * @param verseMapData - Données du verse-map pour cette page (optionnel mais recommandé)
 * @returns Le verset commençant le plus proche de la ligne 8.5, ou null
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
    let effectivePosition: number;

    // Si on a les données du verse-map, utiliser la position exacte
    if (verseMapData && verseMapData[verse.verseKey]) {
      const verseEntry = verseMapData[verse.verseKey];
      if (verseEntry.boxes && verseEntry.boxes.length > 0) {
        const firstBox = verseEntry.boxes[0];
        // Calculer la position effective en lignes (ligne + progression horizontale)
        effectivePosition = calculateEffectiveLinePosition(firstBox.line, firstBox.right);
      } else {
        // Fallback: utiliser le centre de la première ligne
        const firstLine = Math.min(...verse.lines);
        effectivePosition = firstLine + 0.5;
      }
    } else {
      // Fallback sans verse-map: utiliser le centre de la première ligne
      const firstLine = Math.min(...verse.lines);
      effectivePosition = firstLine + 0.5;
    }

    // Calculer la distance avec le centre de la ligne 8 (8.5)
    const distance = Math.abs(effectivePosition - TARGET_POSITION);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}

/**
 * Variante avec ligne cible configurable
 * La position cible est le centre de la ligne spécifiée (ligne + 0.5)
 */
export function getMiddleVerseAtLine(
  pageVerses: PageVerses | null,
  targetLine: number = TARGET_LINE,
  verseMapData?: PageVerseMap | null
): VersePosition | null {
  if (!pageVerses?.verses || pageVerses.verses.length === 0) {
    return null;
  }

  // Position cible = centre de la ligne spécifiée
  const targetPosition = targetLine + 0.5;
  let closestVerse: VersePosition | null = null;
  let minDistance = Infinity;

  for (const verse of pageVerses.verses) {
    let effectivePosition: number;

    if (verseMapData && verseMapData[verse.verseKey]) {
      const verseEntry = verseMapData[verse.verseKey];
      if (verseEntry.boxes && verseEntry.boxes.length > 0) {
        const firstBox = verseEntry.boxes[0];
        effectivePosition = calculateEffectiveLinePosition(firstBox.line, firstBox.right);
      } else {
        const firstLine = Math.min(...verse.lines);
        effectivePosition = firstLine + 0.5;
      }
    } else {
      const firstLine = Math.min(...verse.lines);
      effectivePosition = firstLine + 0.5;
    }

    const distance = Math.abs(effectivePosition - targetPosition);

    if (distance < minDistance) {
      minDistance = distance;
      closestVerse = verse;
    }
  }

  return closestVerse;
}
