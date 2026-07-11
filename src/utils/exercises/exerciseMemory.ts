// Mémorisation (localStorage) des dernières valeurs saisies pour chaque exercice,
// afin de les reproposer à la prochaine ouverture de l'écran de configuration.

import type { RangeMode } from './rangeToPages';
import type { VersePositionType } from '@/types/exercises';
import { getCurrentUser } from './userStats';
import { pushSetup } from './progressSync';

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
  /** Quiz audio : durée max de l'extrait audio de la question (s, 0 = complet). */
  audioSeconds?: number;
  /** Quiz audio : fraction du verset révélée en sixièmes (1-6, 6 = complet). */
  revealFraction?: number;
  /** Quiz audio : mode de réponse (taper l'écran ou réciter au micro). */
  answerMode?: 'tap' | 'recite';
  /** Quiz audio (mode taper) : temps autorisé (s) avant révélation auto. 0 = sans limite. */
  revealTimeout?: number;
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
  const user = getCurrentUser();
  if (user) pushSetup(user, exerciseId, data); // sync Supabase en arrière-plan
}

/**
 * Écrit dans le cache local les réglages récupérés depuis Supabase à la
 * connexion (map { exerciseId: data }). N'appelle PAS pushSetup (pas de boucle).
 */
export function hydrateSetupsLocal(setups: Record<string, unknown>): void {
  if (!isBrowser()) return;
  for (const [exerciseId, data] of Object.entries(setups)) {
    try {
      window.localStorage.setItem(PREFIX + exerciseId, JSON.stringify(data));
    } catch {
      // ignore
    }
  }
}
