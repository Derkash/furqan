// Libellés d'affichage partagés (écrans + widget + notifications).

import { SURAH_PAGES } from '@/utils/exercises/surahPages';

/**
 * Repère d'une page EXPRIMÉ DANS SA SOURATE — « 02/page 1 » désigne la
 * première page de la sourate 2, c'est-à-dire la page 2 du mushaf. C'est la
 * seule numérotation présentée à l'utilisateur : le numéro absolu ne parle
 * pas, le rang dans la sourate situe immédiatement.
 *
 * Une page peut chevaucher deux sourates ; `preferred` permet d'imposer celle
 * du contexte (la séance d'apprentissage connaît la sienne). Sans indication,
 * on retient la sourate la plus tardive présente sur la page — celle vers
 * laquelle on lit.
 */
export function surahPageRef(
  page: number,
  preferred?: number
): { surah: number; index: number; total: number } | null {
  const candidates = surahsOfPage(page);
  if (!candidates.length) return null;
  const chosen =
    (preferred != null && candidates.find((c) => c.id === preferred)) ||
    candidates[candidates.length - 1];
  const info = SURAH_PAGES[chosen.id];
  return {
    surah: chosen.id,
    index: page - info.startPage + 1,
    total: info.endPage - info.startPage + 1,
  };
}

/** « 02/page 1 » — repère d'une page unique. */
export function pageRefLabel(page: number, preferred?: number): string {
  const ref = surahPageRef(page, preferred);
  if (!ref) return `Page ${page}`;
  return `${String(ref.surah).padStart(2, '0')}/page ${ref.index}`;
}

/**
 * Libellé d'un ensemble de pages, en repères de sourate :
 * « 02/page 1 » · « 02/pages 1 à 4 » · « 04/page 30 → 05/page 2 ».
 */
export function pagesLabel(pages: number[], preferred?: number): string {
  if (!pages.length) return '';
  const first = pages[0];
  const last = pages[pages.length - 1];
  const a = surahPageRef(first, preferred);
  const b = surahPageRef(last, preferred);
  if (!a || !b) return first === last ? `Page ${first}` : `Pages ${first} à ${last}`;
  const sa = String(a.surah).padStart(2, '0');
  if (first === last) return `${sa}/page ${a.index}`;
  if (a.surah === b.surah) return `${sa}/pages ${a.index} à ${b.index}`;
  return `${sa}/page ${a.index} → ${String(b.surah).padStart(2, '0')}/page ${b.index}`;
}

/** Sourates couvrant une page (une page peut chevaucher deux sourates). */
export function surahsOfPage(page: number): { id: number; nameSimple: string; nameArabic: string }[] {
  const result: { id: number; nameSimple: string; nameArabic: string }[] = [];
  for (let s = 1; s <= 114; s++) {
    const info = SURAH_PAGES[s];
    if (info && page >= info.startPage && page <= info.endPage) {
      result.push({ id: s, nameSimple: info.nameSimple, nameArabic: info.nameArabic });
    }
  }
  return result;
}

/** Noms des sourates d'une liste de pages, ex. « Al-Baqarah » ou « Al-Baqarah → An-Nisa ». */
export function surahSpanLabel(pages: number[]): string {
  if (!pages.length) return '';
  const first = surahsOfPage(pages[0])[0];
  const lastList = surahsOfPage(pages[pages.length - 1]);
  const last = lastList[lastList.length - 1];
  if (!first || !last) return '';
  return first.id === last.id ? `Sourate ${first.nameSimple}` : `${first.nameSimple} → ${last.nameSimple}`;
}

export const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** « mardi 8 septembre » depuis une clé YYYY-MM-DD (calendrier local). */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
