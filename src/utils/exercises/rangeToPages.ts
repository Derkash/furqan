// Conversion d'une plage (page / hizb / juz / sourate) en plage de pages du Mushaf.

export type RangeMode = 'page' | 'hizb' | 'juz' | 'surah';

export interface ChapterEntry {
  id: number;
  name_arabic: string;
  name_simple: string;
  pages: [number, number];
}

export interface UnitEntry {
  hizb?: number;
  juz?: number;
  startPage: number;
  endPage: number;
}

export interface QuranUnits {
  chapters: ChapterEntry[];
  hizbs: UnitEntry[];
  juzs: UnitEntry[];
}

/** Valeur maximale autorisée pour chaque mode (utilisée pour la validation des saisies). */
export const MODE_MAX: Record<RangeMode, number> = {
  page: 604,
  hizb: 60,
  juz: 30,
  surah: 114,
};

/** Libellés des modes. */
export const MODE_LABELS: Record<RangeMode, string> = {
  page: 'Page',
  hizb: 'Hizb',
  juz: 'Juz',
  surah: 'Sourate',
};

export const MODE_ARABIC: Record<RangeMode, string> = {
  page: 'صفحة',
  hizb: 'حزب',
  juz: 'جزء',
  surah: 'سورة',
};

export interface PageRange {
  startPage: number | null;
  endPage: number | null;
}

/**
 * Convertit une plage exprimée en unités (page/hizb/juz/sourate) en plage de pages.
 * Renvoie { null, null } tant que les bornes ne sont pas saisies ou que les données
 * nécessaires (hizb/juz/sourate) ne sont pas encore chargées.
 */
export function unitToPageRange(
  mode: RangeMode,
  start: number | null,
  end: number | null,
  data: QuranUnits | null
): PageRange {
  if (start == null || end == null) return { startPage: null, endPage: null };

  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  if (mode === 'page') {
    return { startPage: lo, endPage: hi };
  }

  if (!data) return { startPage: null, endPage: null };

  if (mode === 'hizb') {
    const a = data.hizbs.find((h) => h.hizb === lo);
    const b = data.hizbs.find((h) => h.hizb === hi);
    if (!a || !b) return { startPage: null, endPage: null };
    return { startPage: a.startPage, endPage: b.endPage };
  }

  if (mode === 'juz') {
    const a = data.juzs.find((j) => j.juz === lo);
    const b = data.juzs.find((j) => j.juz === hi);
    if (!a || !b) return { startPage: null, endPage: null };
    return { startPage: a.startPage, endPage: b.endPage };
  }

  // surah
  const a = data.chapters.find((c) => c.id === lo);
  const b = data.chapters.find((c) => c.id === hi);
  if (!a || !b) return { startPage: null, endPage: null };
  return { startPage: a.pages[0], endPage: b.pages[1] };
}
