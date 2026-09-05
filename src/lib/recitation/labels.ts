// Libellés d'affichage partagés (écrans + widget + notifications).

import { SURAH_PAGES } from '@/utils/exercises/surahPages';

/** « Pages 3 à 6 » / « Page 5 » / '' — pour une liste triée. */
export function pagesLabel(pages: number[]): string {
  if (!pages.length) return '';
  const first = pages[0];
  const last = pages[pages.length - 1];
  return first === last ? `Page ${first}` : `Pages ${first} à ${last}`;
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
