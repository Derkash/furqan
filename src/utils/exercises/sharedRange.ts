// Plage de pages « globale » partagée entre TOUS les exercices et le vocabulaire.
// Dès que l'utilisateur choisit une plage quelque part, elle devient le défaut
// partout (« je te la donne une fois, tu l'appliques à tout ce qui en découle »).

import type { RangeMode } from './rangeToPages';

export interface SharedRange {
  mode: RangeMode;
  start: number | null;
  end: number | null;
}

const KEY = 'almuraja3a:range';

export function loadSharedRange(): SharedRange | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (r && typeof r === 'object' && 'mode' in r) return r as SharedRange;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSharedRange(r: SharedRange): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
