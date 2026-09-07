// Sourate en cours d'apprentissage — le « lâhiq » de la méthode classique :
// ce qu'on vient de mémoriser, à reconsolider CHAQUE JOUR depuis le début de
// la sourate jusqu'à la page atteinte.
//
// Deux principes tiennent ce module :
//  1. La séance est TOUJOURS séparée du cycle de révision. Réciter une page
//     en révision ne dispense pas de la réciter ici, et inversement : mélanger
//     les deux est la meilleure façon de tout confondre.
//  2. Le volume grandit à mesure qu'on avance dans la sourate. Passé un
//     plafond, les DERNIÈRES pages — les plus fragiles — restent au programme
//     tous les jours, et le début tourne par fenêtre glissante : la sourate
//     entière est couverte en quelques jours sans écraser la journée.

import { SURAH_PAGES } from '@/utils/exercises/surahPages';
import { daysBetween } from './mastery';
import type { LearningConfig, PlannedSlot, ScheduleConfig, Slot } from './types';

/** Minutes estimées par page pour dimensionner la séance. */
export const LEARNING_MIN_PER_PAGE = 5;
/** Durée plancher d'une séance d'apprentissage. */
const MIN_DURATION = 15;

/** Toutes les pages de la sourate jusqu'à la page atteinte (incluse). */
export function learningSpan(config: LearningConfig): number[] {
  const info = SURAH_PAGES[config.surah];
  if (!info) return [];
  const last = Math.min(Math.max(config.currentPage, info.startPage), info.endPage);
  const pages: number[] = [];
  for (let p = info.startPage; p <= last; p++) pages.push(p);
  return pages;
}

/**
 * Pages à réciter un jour donné. Sans plafond : tout le parcours. Avec
 * plafond : la moitié récente toujours incluse + une fenêtre glissante sur
 * le début, qui avance d'un cran par jour.
 */
export function learningPagesForDay(config: LearningConfig, dayIndex: number): number[] {
  const all = learningSpan(config);
  const cap = config.dailyCap;
  if (!cap || cap <= 0 || all.length <= cap) return all;

  const recentCount = Math.max(1, Math.ceil(cap / 2));
  const recent = all.slice(-recentCount);
  const earlier = all.slice(0, all.length - recentCount);
  const windowSize = Math.max(1, cap - recentCount);
  if (earlier.length <= windowSize) return all;

  const windows = Math.ceil(earlier.length / windowSize);
  const w = ((dayIndex % windows) + windows) % windows;
  const chunk = earlier.slice(w * windowSize, w * windowSize + windowSize);
  return [...chunk, ...recent]; // ordre du mushaf conservé
}

/** Index de rotation : nombre de jours écoulés depuis la création du programme. */
export function learningDayIndex(programCreatedAt: string, todayKey: string): number {
  return Math.max(0, daysBetween(programCreatedAt.slice(0, 10), todayKey));
}

/** Minuit (23 h 59) : borne de fin de la séance de sourate. */
const MIDNIGHT = 24 * 60 - 1;

/**
 * Créneau de la séance, placé hors des créneaux de révision.
 * - 'end'   : de la FIN de la plage de révision jusqu'à MINUIT (défaut) —
 *             la sourate du jour se doit jusqu'à 00 h, ni plus ni moins :
 *             demain, c'est la séance de demain qui la redemandera ;
 * - 'custom': de l'heure choisie jusqu'à minuit, même logique ;
 * - 'start' : avant la plage de révision (durée estimée par le volume).
 */
export function learningSlot(
  config: LearningConfig,
  schedule: ScheduleConfig,
  pageCount: number
): Slot | null {
  if (pageCount <= 0) return null;
  const { startMin, endMin } = schedule.hours;

  if (config.placement === 'custom' && config.customStartMin != null) {
    const start = Math.max(0, Math.min(config.customStartMin, MIDNIGHT - MIN_DURATION));
    return { startMin: start, endMin: MIDNIGHT };
  }
  if (config.placement === 'start') {
    const duration = Math.max(MIN_DURATION, pageCount * LEARNING_MIN_PER_PAGE);
    const end = Math.max(MIN_DURATION, startMin);
    return { startMin: Math.max(0, end - duration), endMin: end };
  }
  // 'end' — de la fin de la révision jusqu'à minuit.
  return { startMin: Math.min(endMin, MIDNIGHT - MIN_DURATION), endMin: MIDNIGHT };
}

/** Séance complète du jour (créneau + pages), ou null si rien à réciter. */
export function buildLearningSlot(
  config: LearningConfig | null,
  schedule: ScheduleConfig,
  programCreatedAt: string,
  todayKey: string
): PlannedSlot | null {
  if (!config) return null;
  const pages = learningPagesForDay(config, learningDayIndex(programCreatedAt, todayKey));
  const slot = learningSlot(config, schedule, pages.length);
  if (!slot || !pages.length) return null;
  return { ...slot, pages, kind: 'learning' };
}

// ---------------------------------------------------------------------------
// Progression dans la sourate
// ---------------------------------------------------------------------------

export interface LearningProgress {
  surahName: string;
  startPage: number;
  endPage: number;
  currentPage: number;
  /** Pages mémorisées sur le total de la sourate. */
  done: number;
  total: number;
  percent: number;
  /** La sourate est-elle entièrement mémorisée ? */
  complete: boolean;
}

export function learningProgress(config: LearningConfig): LearningProgress | null {
  const info = SURAH_PAGES[config.surah];
  if (!info) return null;
  const total = info.endPage - info.startPage + 1;
  const current = Math.min(Math.max(config.currentPage, info.startPage), info.endPage);
  const done = current - info.startPage + 1;
  return {
    surahName: info.nameSimple,
    startPage: info.startPage,
    endPage: info.endPage,
    currentPage: current,
    done,
    total,
    percent: Math.round((done / total) * 100),
    complete: current >= info.endPage,
  };
}

/** Sourate suivante dans l'ordre du mushaf (null après An-Nâs). */
export function nextSurah(surah: number): number | null {
  return surah >= 114 ? null : surah + 1;
}

/**
 * Le volume quotidien devient-il déraisonnable ? Sert à proposer un plafond
 * plutôt qu'à l'imposer : la décision reste à l'utilisateur.
 */
export function isVolumeHeavy(config: LearningConfig): boolean {
  return !config.dailyCap && learningSpan(config).length > 12;
}
