// Planificateur : construit le cycle (pages du périmètre → journées) puis
// répartit l'objectif d'une journée entre les créneaux. Sections 2, 4 et 15
// du brief. Fonctions pures : ni horloge ni I/O.

import { JUZ_PAGES, HIZB_PAGES } from './unitPages';
import type { CycleDay, Objective, PlannedSlot, Slot } from './types';

// ---------------------------------------------------------------------------
// Construction du cycle
// ---------------------------------------------------------------------------

/**
 * Découpe le périmètre en journées selon l'objectif, dans l'ordre du mushaf.
 *
 * - juzPerDay : coupe aux frontières RÉELLES du mushaf (hizb pour ½ juz',
 *   juz' pour 1, un juz' sur deux pour 2) — « 3 juz' connus, 1 juz'/jour »
 *   donne bien un juz' entier par jour même si les juz' font 19-21 pages.
 * - pagesPerDay : remplit chaque jour à la cible, le dernier est plus court.
 * - totalDays : répartition équilibrée sur n jours (surplus sur les premiers).
 */
export function buildCycleDays(pages: number[], objective: Objective): CycleDay[] {
  if (!pages.length) return [];

  if (objective.kind === 'pagesPerDay') {
    const target = Math.max(1, Math.floor(objective.pages));
    const days: CycleDay[] = [];
    for (let i = 0; i < pages.length; i += target) {
      days.push({ index: days.length, pages: pages.slice(i, i + target) });
    }
    return days;
  }

  if (objective.kind === 'totalDays') {
    const n = Math.max(1, Math.min(Math.floor(objective.days), pages.length));
    const base = Math.floor(pages.length / n);
    const extra = pages.length % n; // les `extra` premiers jours prennent 1 page de plus
    const days: CycleDay[] = [];
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const count = base + (i < extra ? 1 : 0);
      days.push({ index: i, pages: pages.slice(cursor, cursor + count) });
      cursor += count;
    }
    return days;
  }

  // juzPerDay : frontières de fin d'unité (page de fin de hizb / juz').
  const boundaryEnds = new Set<number>();
  if (objective.amount === 0.5) {
    for (let h = 1; h <= 60; h++) boundaryEnds.add(HIZB_PAGES[h].endPage);
  } else {
    const step = objective.amount; // 1 ou 2
    for (let j = step; j <= 30; j += step) boundaryEnds.add(JUZ_PAGES[j].endPage);
    boundaryEnds.add(JUZ_PAGES[30].endPage);
  }

  const days: CycleDay[] = [];
  let current: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    current.push(pages[i]);
    const next = pages[i + 1];
    // Fin de journée : frontière franchie entre cette page et la suivante.
    // (les pages absentes du périmètre entre les deux comptent aussi)
    let crossed = false;
    if (next != null) {
      for (let p = pages[i]; p < next; p++) {
        if (boundaryEnds.has(p)) { crossed = true; break; }
      }
    }
    if (crossed || next == null) {
      days.push({ index: days.length, pages: current });
      current = [];
    }
  }
  return days;
}

// ---------------------------------------------------------------------------
// Répartition d'une journée entre les créneaux
// ---------------------------------------------------------------------------

/**
 * Répartition automatique équilibrée, ordre des pages préservé : le surplus va
 * aux PREMIERS créneaux (brief §4 : 20 pages / 6 créneaux → 4/4/3/3/3/3).
 */
export function splitPagesAcrossSlots(pages: number[], slots: Slot[]): PlannedSlot[] {
  if (!slots.length) return [];
  const base = Math.floor(pages.length / slots.length);
  const extra = pages.length % slots.length;
  const planned: PlannedSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < slots.length; i++) {
    const count = base + (i < extra ? 1 : 0);
    planned.push({ ...slots[i], pages: pages.slice(cursor, cursor + count) });
    cursor += count;
  }
  return planned;
}

/** Répartition personnalisée : nombre de pages fixé par créneau (tronqué au reste). */
export function splitPagesCustom(pages: number[], slots: Slot[], pagesPerSlot: number[]): PlannedSlot[] {
  const planned: PlannedSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < slots.length; i++) {
    const want = Math.max(0, Math.floor(pagesPerSlot[i] ?? 0));
    planned.push({ ...slots[i], pages: pages.slice(cursor, cursor + want) });
    cursor += want;
  }
  return planned;
}

// ---------------------------------------------------------------------------
// Faisabilité
// ---------------------------------------------------------------------------

/** Minutes de récitation estimées par page (prudent, réglable plus tard). */
export const DEFAULT_MIN_PER_PAGE = 5;

export interface FeasibilityCheck {
  ok: boolean;
  /** Minutes nécessaires estimées pour l'objectif du jour. */
  neededMin: number;
  /** Minutes réellement disponibles dans les créneaux. */
  availableMin: number;
}

/**
 * L'objectif du jour tient-il raisonnablement dans les créneaux ? (brief §4 :
 * sinon, proposer plus de pages par créneau / plus de créneaux / plage élargie
 * / cycle allongé — décisions prises par l'UI, pas ici).
 */
export function checkFeasibility(
  dayPageCount: number,
  slots: Slot[],
  minPerPage: number = DEFAULT_MIN_PER_PAGE
): FeasibilityCheck {
  const availableMin = slots.reduce((sum, s) => sum + Math.max(0, s.endMin - s.startMin), 0);
  const neededMin = dayPageCount * minPerPage;
  return { ok: neededMin <= availableMin, neededMin, availableMin };
}

// ---------------------------------------------------------------------------
// Report d'un créneau incomplet
// ---------------------------------------------------------------------------

/**
 * Place les pages restantes AVANT les nouvelles pages du créneau suivant,
 * sans doublon et en respectant l'ordre du mushaf dans chaque groupe (brief §15).
 */
export function carryOverPages(remaining: number[], nextPlanned: number[]): number[] {
  const seen = new Set<number>();
  const merged: number[] = [];
  for (const p of [...remaining, ...nextPlanned]) {
    if (!seen.has(p)) { seen.add(p); merged.push(p); }
  }
  return merged;
}
