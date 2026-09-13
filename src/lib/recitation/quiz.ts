// Quiz audio quotidien : chaque jour (15 h par défaut, réglable), des
// questions audio tirées de TOUT le périmètre mémorisé — celui que la
// récitation quotidienne connaît déjà.
//
// Deux règles de sélection, demandées explicitement :
//  1. COUVERTURE MAXIMALE : au fil des jours, voir le plus de pages
//     possible — jamais deux questions sur la même page dans un même quiz,
//     ni sur une page déjà interrogée aujourd'hui ou hier (sauf pénurie) ;
//     les pages jamais interrogées passent d'abord, puis les plus anciennes.
//  2. RÉSERVE DE FAUTES : 1 à 2 questions par quiz reviennent sur les
//     échecs récents non encore rattrapés — la faute d'avant-hier revient
//     jusqu'à ce qu'elle soit trouvée.

import { addDays } from './schedule';
import type { Program } from './types';

export interface QuizSettings {
  enabled: boolean;
  /** Heure du rappel quotidien, minutes depuis minuit (défaut 15 h). */
  hourMin: number;
  questionCount: 5 | 10 | 15 | 20;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  enabled: true,
  hourMin: 15 * 60,
  questionCount: 10,
};

export interface QuizResult {
  page: number;
  verseKey: string;
  found: boolean;
  at: string; // ISO
}

/** Dernière date (YYYY-MM-DD) où chaque page a été interrogée. */
export type QuizCoverage = Record<number, string>;

// ---------------------------------------------------------------------------
// Sélection (pure, testée)
// ---------------------------------------------------------------------------

/** Fenêtre de repêchage des fautes récentes, en jours. */
const FAIL_WINDOW_DAYS = 14;
/** Nombre de questions réservées aux fautes récentes. */
const FAIL_RESERVE = 2;

/**
 * Pages des échecs récents NON rattrapés : un « pas trouvé » des 14 derniers
 * jours, sans « trouvé » plus récent sur la même page. Les plus récents
 * d'abord.
 */
export function recentFailPages(results: QuizResult[], todayKey: string): number[] {
  const cutoff = addDays(todayKey, -FAIL_WINDOW_DAYS);
  const lastByPage = new Map<number, QuizResult>();
  for (const r of results) {
    const prev = lastByPage.get(r.page);
    if (!prev || r.at > prev.at) lastByPage.set(r.page, r);
  }
  return [...lastByPage.values()]
    .filter((r) => !r.found && r.at.slice(0, 10) >= cutoff)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((r) => r.page);
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Choisit les pages du quiz du jour. `rng` est injectable (tests).
 * Renvoie moins que `count` seulement si le périmètre lui-même est plus petit.
 */
export function selectQuizPages(
  perimeter: number[],
  count: number,
  coverage: QuizCoverage,
  results: QuizResult[],
  todayKey: string,
  rng: () => number = Math.random
): number[] {
  if (!perimeter.length) return [];
  const wanted = Math.min(count, perimeter.length);
  const chosen: number[] = [];
  const taken = new Set<number>();

  // 1. La réserve de fautes — même vues récemment : c'est leur raison d'être.
  for (const p of recentFailPages(results, todayKey)) {
    if (chosen.length >= Math.min(FAIL_RESERVE, wanted)) break;
    if (perimeter.includes(p) && !taken.has(p)) {
      chosen.push(p);
      taken.add(p);
    }
  }

  // 2. Couverture : jamais interrogées d'abord (ordre mélangé), puis par
  //    ancienneté — en excluant aujourd'hui/hier tant qu'il y a le choix.
  const yesterday = addDays(todayKey, -1);
  const never = shuffle(perimeter.filter((p) => !taken.has(p) && !coverage[p]), rng);
  const seen = perimeter
    .filter((p) => !taken.has(p) && coverage[p])
    .sort((a, b) => (coverage[a] < coverage[b] ? -1 : coverage[a] > coverage[b] ? 1 : a - b));
  const fresh = seen.filter((p) => coverage[p] < yesterday);
  const stale = seen.filter((p) => coverage[p] >= yesterday); // pénurie seulement

  for (const p of [...never, ...fresh, ...stale]) {
    if (chosen.length >= wanted) break;
    if (!taken.has(p)) {
      chosen.push(p);
      taken.add(p);
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Stockage (local, comme le reste de la récitation)
// ---------------------------------------------------------------------------

const COVERAGE_KEY = 'almuraja3a:recitation:quizCoverage';
const RESULTS_KEY = 'almuraja3a:recitation:quizResults';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function loadCoverage(): QuizCoverage {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(COVERAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function loadQuizResults(): QuizResult[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(RESULTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Enregistre une réponse : historique en append + couverture de la page. */
export function recordQuizAnswer(page: number, verseKey: string, found: boolean, now: Date): void {
  if (!isBrowser()) return;
  try {
    const results = [...loadQuizResults(), { page, verseKey, found, at: now.toISOString() }];
    window.localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
    const coverage = loadCoverage();
    const y = now.getFullYear();
    coverage[page] = `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    window.localStorage.setItem(COVERAGE_KEY, JSON.stringify(coverage));
  } catch {
    /* quota — silencieux */
  }
}

/** Réglages effectifs du quiz (Program.quiz, sinon défauts). */
export function quizSettings(program: Program | null): QuizSettings {
  return program?.quiz ?? DEFAULT_QUIZ_SETTINGS;
}

/** Statistiques de couverture pour l'écran (combien de pages déjà vues). */
export function coverageStats(perimeter: number[], coverage: QuizCoverage): { seen: number; total: number } {
  return { seen: perimeter.filter((p) => coverage[p]).length, total: perimeter.length };
}
