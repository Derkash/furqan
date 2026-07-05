// Mémorisation (localStorage) des dernières valeurs saisies pour chaque exercice,
// afin de les reproposer à la prochaine ouverture de l'écran de configuration.

import type { RangeMode } from './rangeToPages';
import type { VersePositionType } from '@/types/exercises';

export interface StoredSetup {
  /** Mode de plage (page / hizb / juz / sourate) — pour les exercices à plage. */
  mode?: RangeMode;
  /** Borne de début saisie (dans l'unité du mode). */
  start?: number | null;
  /** Borne de fin saisie (dans l'unité du mode). */
  end?: number | null;
  /** Page unique (ancien Hifz — conservé pour rétro-compat). */
  singlePage?: number | null;
  /** Quiz audio : verset à identifier à l'audio. */
  identifyPosition?: VersePositionType;
  /** Quiz audio : positions à découvrir ensuite. */
  revealAfter?: VersePositionType[];
  /** Séquentiel : positions de versets à afficher. */
  showPositions?: VersePositionType[];
  /** Séquentiel : sens de progression. */
  direction?: 'forward' | 'backward';
  /** Nombre de questions souhaité (tous exercices sauf Hifz). */
  questionCount?: number;
}

const PREFIX = 'almuraja3a:setup:';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** Lit les dernières valeurs saisies pour un exercice donné, ou null si aucune. */
export function loadSetup(exerciseId: string): StoredSetup | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + exerciseId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSetup;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Enregistre les dernières valeurs saisies pour un exercice donné. */
export function saveSetup(exerciseId: string, data: StoredSetup): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PREFIX + exerciseId, JSON.stringify(data));
  } catch {
    // Quota plein ou stockage indisponible : on ignore silencieusement.
  }
}
