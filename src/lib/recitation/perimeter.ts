// Périmètre mémorisé : combine les sélections déclarées (plages de sourates,
// sourates, juz', plages de pages, pages) en un ensemble de pages UNIQUES,
// triées dans l'ordre du mushaf. Section 1 du brief : une page présente dans
// plusieurs sélections n'est comptée qu'une seule fois.

import { SURAH_PAGES } from '@/utils/exercises/surahPages';
import { JUZ_PAGES } from './unitPages';
import type { MemorizedSelection, PerimeterSummary } from './types';

export const TOTAL_MUSHAF_PAGES = 604;

function addRange(set: Set<number>, from: number, to: number): void {
  const lo = Math.max(1, Math.min(from, to));
  const hi = Math.min(TOTAL_MUSHAF_PAGES, Math.max(from, to));
  for (let p = lo; p <= hi; p++) set.add(p);
}

/** Pages couvertes par UNE sélection (bornes du mushaf respectées). */
export function selectionPages(sel: MemorizedSelection): number[] {
  const set = new Set<number>();
  switch (sel.kind) {
    case 'page':
      addRange(set, sel.page, sel.page);
      break;
    case 'page-range':
      addRange(set, sel.fromPage, sel.toPage);
      break;
    case 'surah': {
      const s = SURAH_PAGES[sel.surah];
      if (s) addRange(set, s.startPage, s.endPage);
      break;
    }
    case 'surah-range': {
      const a = SURAH_PAGES[Math.min(sel.fromSurah, sel.toSurah)];
      const b = SURAH_PAGES[Math.max(sel.fromSurah, sel.toSurah)];
      if (a && b) addRange(set, a.startPage, b.endPage);
      break;
    }
    case 'juz': {
      const j = JUZ_PAGES[sel.juz];
      if (j) addRange(set, j.startPage, j.endPage);
      break;
    }
  }
  return [...set];
}

/** Combine toutes les sélections → pages uniques triées (ordre du mushaf). */
export function perimeterPages(selections: MemorizedSelection[]): number[] {
  const set = new Set<number>();
  for (const sel of selections) for (const p of selectionPages(sel)) set.add(p);
  return [...set].sort((a, b) => a - b);
}

/** Résumé avant validation : sourates/juz' couverts, bornes, total. */
export function perimeterSummary(pages: number[]): PerimeterSummary {
  const set = new Set(pages);
  const surahs: number[] = [];
  for (let s = 1; s <= 114; s++) {
    const info = SURAH_PAGES[s];
    if (!info) continue;
    for (let p = info.startPage; p <= info.endPage; p++) {
      if (set.has(p)) { surahs.push(s); break; }
    }
  }
  const juzs: number[] = [];
  const completeJuzs: number[] = [];
  for (let j = 1; j <= 30; j++) {
    const info = JUZ_PAGES[j];
    let any = false;
    let all = true;
    for (let p = info.startPage; p <= info.endPage; p++) {
      if (set.has(p)) any = true;
      else all = false;
    }
    if (any) juzs.push(j);
    if (any && all) completeJuzs.push(j);
  }
  return {
    totalPages: pages.length,
    firstPage: pages.length ? pages[0] : null,
    lastPage: pages.length ? pages[pages.length - 1] : null,
    surahs,
    juzs,
    completeJuzs,
  };
}
