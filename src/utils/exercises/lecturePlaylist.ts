// Construction de la sélection de lecture (mode Lecture) : convertit une plage
// choisie (verset / page / hizb / juz / sourate) en liste ordonnée de versets à
// réciter, avec leur numéro global et leur page.

import { toGlobalAyahNumber, fromGlobalAyahNumber } from '@/utils/ayahMapping';
import { unitToPageRange, type QuranUnits, type RangeMode } from '@/utils/exercises/rangeToPages';

export type SelMode = 'verse' | RangeMode; // verse | page | hizb | juz | surah

export interface PlayConfig {
  selMode: SelMode;
  // Mode "verset" : bornes sourate:verset.
  surahStart: number;
  verseStart: number;
  surahEnd: number;
  verseEnd: number;
  // Modes page/hizb/juz/sourate : bornes en unités.
  unitStart: number | null;
  unitEnd: number | null;
  // Répétitions.
  verseRepeat: number; // chaque verset joué N fois (≥ 1)
  selectionRepeat: number; // toute la sélection jouée M fois (≥ 1 ; 0 = infini)
  // Récitation française (Leclerc) après chaque verset.
  french: boolean;
}

export interface SelVerse {
  verseKey: string;
  globalNumber: number;
  page: number;
}

export const DEFAULT_CONFIG: PlayConfig = {
  selMode: 'page',
  surahStart: 2,
  verseStart: 1,
  surahEnd: 2,
  verseEnd: 5,
  unitStart: null,
  unitEnd: null,
  verseRepeat: 1,
  selectionRepeat: 1,
  french: false,
};

/** Liste ordonnée des versets couverts par la configuration. */
export function buildSelection(
  cfg: PlayConfig,
  units: QuranUnits | null,
  versePage: Record<string, number>
): SelVerse[] {
  const toSel = (g: number): SelVerse => {
    const { surah, verse } = fromGlobalAyahNumber(g);
    const vk = `${surah}:${verse}`;
    return { verseKey: vk, globalNumber: g, page: versePage[vk] ?? 1 };
  };

  if (cfg.selMode === 'verse') {
    const g1 = toGlobalAyahNumber(cfg.surahStart, cfg.verseStart);
    const g2 = toGlobalAyahNumber(cfg.surahEnd, cfg.verseEnd);
    const lo = Math.min(g1, g2);
    const hi = Math.max(g1, g2);
    const out: SelVerse[] = [];
    for (let g = lo; g <= hi; g++) out.push(toSel(g));
    return out;
  }

  // Modes page/hizb/juz/sourate → plage de pages → tous les versets de ces pages.
  const { startPage, endPage } = unitToPageRange(cfg.selMode, cfg.unitStart, cfg.unitEnd, units);
  if (startPage == null || endPage == null) return [];
  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);
  const out: SelVerse[] = [];
  for (const [vk, pg] of Object.entries(versePage)) {
    if (pg >= lo && pg <= hi) {
      const [s, v] = vk.split(':').map(Number);
      out.push({ verseKey: vk, globalNumber: toGlobalAyahNumber(s, v), page: pg });
    }
  }
  out.sort((a, b) => a.globalNumber - b.globalNumber);
  return out;
}

/** Résumé lisible de la sélection (pour l'en-tête). */
export function describeSelection(cfg: PlayConfig, count: number): string {
  const rep =
    cfg.verseRepeat > 1 ? ` · chaque verset ×${cfg.verseRepeat}` : '';
  const loop =
    cfg.selectionRepeat === 0
      ? ' · en boucle ∞'
      : cfg.selectionRepeat > 1
        ? ` · sélection ×${cfg.selectionRepeat}`
        : '';
  const fr = cfg.french ? ' · + français' : '';
  return `${count} verset${count > 1 ? 's' : ''}${rep}${loop}${fr}`;
}
