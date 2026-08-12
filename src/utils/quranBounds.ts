/**
 * Bornes EXACTES (n° global de verset 1-6236) d'une plage hizb / juz / sourate.
 *
 * Les hizb et juz ne commencent PAS en début de page : convertir en pages
 * (unitToPageRange) inclut des versets d'avant le début et d'après la fin.
 * Ce module fournit les bornes au verset près, via les 240 quarts de hizb
 * (public/qcf-data/hizb-quarters.json, généré depuis les métadonnées
 * alquran.cloud) — les exercices excluent alors les versets hors plage.
 */
import { SURAH_START_AYAH, TOTAL_AYAHS } from '@/utils/ayahMapping';
import type { RangeMode } from '@/utils/exercises/rangeToPages';

export interface HizbQuarter {
  q: number; // 1-240
  surah: number;
  ayah: number;
}

export interface GlobalBounds {
  startGlobal: number;
  endGlobal: number;
}

let cache: HizbQuarter[] | null = null;
let promise: Promise<HizbQuarter[]> | null = null;

export function loadHizbQuarters(): Promise<HizbQuarter[]> {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = fetch('/qcf-data/hizb-quarters.json')
      .then((r) => r.json())
      .then((list: HizbQuarter[]) => {
        cache = list;
        return list;
      })
      .catch(() => []);
  }
  return promise;
}

function quarterGlobal(quarters: HizbQuarter[], index0: number): number | null {
  const q = quarters[index0];
  if (!q) return null;
  return SURAH_START_AYAH[q.surah] + q.ayah - 1;
}

/**
 * Bornes globales [premier, dernier verset] de la plage. Renvoie null si la
 * plage est déjà exacte par nature (mode page) ou si les données manquent.
 */
export function unitToGlobalBounds(
  mode: RangeMode,
  start: number | null,
  end: number | null,
  quarters: HizbQuarter[] | null
): GlobalBounds | null {
  if (start == null || end == null) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  if (mode === 'surah') {
    if (lo < 1 || hi > 114) return null;
    return {
      startGlobal: SURAH_START_AYAH[lo],
      endGlobal: hi >= 114 ? TOTAL_AYAHS : SURAH_START_AYAH[hi + 1] - 1,
    };
  }

  if (mode !== 'hizb' && mode !== 'juz') return null; // page : déjà exact

  if (!quarters || quarters.length < 240) return null;
  const per = mode === 'hizb' ? 4 : 8;
  const max = mode === 'hizb' ? 60 : 30;
  if (lo < 1 || hi > max) return null;

  const startGlobal = quarterGlobal(quarters, (lo - 1) * per);
  if (startGlobal == null) return null;
  const nextIdx = hi * per;
  const nextStart = nextIdx >= 240 ? null : quarterGlobal(quarters, nextIdx);
  return { startGlobal, endGlobal: nextStart == null ? TOTAL_AYAHS : nextStart - 1 };
}

/** Un verset (n° global) est-il dans les bornes ? Bornes absentes = oui. */
export function inGlobalBounds(globalNumber: number, bounds: GlobalBounds | null | undefined): boolean {
  if (!bounds) return true;
  return globalNumber >= bounds.startGlobal && globalNumber <= bounds.endGlobal;
}
