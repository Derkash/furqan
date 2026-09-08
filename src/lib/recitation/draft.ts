// Brouillon de configuration du programme : les quatre écrans de mise en place
// (périmètre → objectif → horaires → répartition) lisent/écrivent ce document
// localStorage, puis `finalizeProgram` le transforme en Program + Cycle.
// Modifier le programme plus tard réutilise le même brouillon, pré-rempli —
// l'historique (sessions, évaluations) n'est JAMAIS touché (brief §19).

import { archiveToday } from './dayEngine';
import { buildCycleDays, rotateCycleDays } from './planner';
import { perimeterPages } from './perimeter';
import { cycleDayDates, startDateForIndex, toDateKey } from './schedule';
import {
  clearDayState,
  loadCycle,
  loadDayState,
  loadProgram,
  loadSessions,
  saveCycle,
  saveProgram,
} from './store';
import type { Cycle, MemorizedSelection, Objective, Program, ScheduleConfig } from './types';

export interface ProgramDraft {
  selections: MemorizedSelection[];
  objective: Objective | null;
  schedule: ScheduleConfig;
  slotSplit: Program['slotSplit'];
  carryOver: Program['carryOver'];
  reinforcementEnabled: boolean;
  endReminderMin: number | null;
  /** Sourate en cours d'apprentissage (séance quotidienne dédiée). */
  learning: Program['learning'];
  /** Première page du cycle (le cycle tourne autour) — null = début du périmètre. */
  startPage: number | null;
  /** Rappels d'adhkar (lever / zénith / coucher du soleil). */
  adhkarEnabled: boolean;
}

const DRAFT_KEY = 'almuraja3a:recitation:draft';

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  hours: { startMin: 8 * 60, endMin: 20 * 60, frequencyMin: 120 },
  remindersEnabled: true,
};

export function emptyDraft(): ProgramDraft {
  return {
    selections: [],
    objective: null,
    schedule: DEFAULT_SCHEDULE,
    slotSplit: { mode: 'auto' },
    carryOver: 'auto',
    reinforcementEnabled: true,
    endReminderMin: 15,
    learning: null,
    startPage: null,
    adhkarEnabled: true,
  };
}

export function loadDraft(): ProgramDraft {
  if (typeof window === 'undefined') return emptyDraft();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<ProgramDraft>) };
  } catch {
    /* brouillon illisible : repartir de zéro */
  }
  // Pas de brouillon : pré-remplir depuis le programme existant (modification).
  const existing = loadProgram();
  if (existing) {
    return {
      selections: existing.selections,
      objective: existing.objective,
      schedule: existing.schedule,
      slotSplit: existing.slotSplit,
      carryOver: existing.carryOver,
      reinforcementEnabled: existing.reinforcementEnabled,
      endReminderMin: existing.endReminderMin,
      learning: existing.learning ?? null,
      startPage: existing.startPage ?? null,
      adhkarEnabled: existing.adhkarEnabled ?? true,
    };
  }
  return emptyDraft();
}

export function saveDraft(draft: ProgramDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota — silencieux */
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

/** Position courante dans le cycle (pour l'UI de modification). */
export function cyclePosition(now: Date): { dayNumber: number; totalDays: number } | null {
  const program = loadProgram();
  const cycle = loadCycle();
  if (!program || !cycle || !cycle.days.length) return null;
  const dates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const todayKey = toDateKey(now);
  let idx = dates.indexOf(todayKey);
  if (idx === -1) idx = Math.min(dates.filter((d) => d < todayKey).length, cycle.days.length - 1);
  return { dayNumber: idx + 1, totalDays: cycle.days.length };
}

/** Mode d'enregistrement quand un cycle est déjà en cours. */
export type FinalizeMode = 'restart' | 'continue';

/**
 * Valide le brouillon → Program + Cycle enregistrés. Le périmètre peut évoluer
 * sans perdre l'historique : seuls program/cycle/dayState sont remplacés.
 *
 * mode 'continue' (modification en cours de cycle) :
 *  - périmètre et objectif INCHANGÉS → le cycle est conservé tel quel, seule
 *    sa date de départ est recalée pour que « jour 3 sur 6 » reste vrai avec
 *    les nouveaux horaires ;
 *  - sinon → le cycle repart d'AUJOURD'HUI sur les pages non encore récitées
 *    de ce cycle : on poursuit là où on en est, jamais depuis le début.
 * mode 'restart' : nouveau cycle complet dès aujourd'hui (comportement
 * historique).
 */
export function finalizeProgram(
  draft: ProgramDraft,
  now: Date,
  mode: FinalizeMode = 'restart'
): { program: Program; cycle: Cycle } | null {
  if (!draft.selections.length || !draft.objective) return null;
  const pages = perimeterPages(draft.selections);
  if (!pages.length) return null;
  const nowIso = now.toISOString();
  const todayKey = toDateKey(now);
  const existing = loadProgram();
  const program: Program = {
    selections: draft.selections,
    perimeterPages: pages,
    objective: draft.objective,
    schedule: draft.schedule,
    slotSplit: draft.slotSplit,
    carryOver: draft.carryOver,
    reinforcementEnabled: draft.reinforcementEnabled,
    endReminderMin: draft.endReminderMin,
    learning: draft.learning,
    startPage: draft.startPage,
    adhkarEnabled: draft.adhkarEnabled,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  const previous = loadCycle();
  let cycle: Cycle;

  if (mode === 'continue' && previous && existing && previous.days.length) {
    const samePlan =
      JSON.stringify(existing.perimeterPages) === JSON.stringify(pages) &&
      JSON.stringify(existing.objective) === JSON.stringify(draft.objective) &&
      (existing.startPage ?? null) === (draft.startPage ?? null);
    const oldDates = cycleDayDates(existing.schedule, previous.startDate, previous.days.length);
    let idx = oldDates.indexOf(todayKey);
    if (idx === -1) idx = Math.min(oldDates.filter((d) => d < todayKey).length, previous.days.length - 1);

    if (samePlan) {
      // Même plan : on garde les journées du cycle, on recale seulement la
      // date de départ pour que le jour courant reste le jour courant.
      cycle = {
        number: previous.number,
        startDate: startDateForIndex(draft.schedule, todayKey, idx),
        days: previous.days,
      };
    } else {
      // Plan modifié : poursuivre sur les pages du cycle NON encore récitées.
      const recited = new Set<number>();
      for (const rec of loadSessions()) {
        if (rec.kind === 'learning' || rec.date < previous.startDate) continue;
        for (const p of rec.recitedPages) recited.add(p);
      }
      const ds = loadDayState();
      if (ds?.date === todayKey) for (const p of ds.recitedPages) recited.add(p);
      const remaining = pages.filter((p) => !recited.has(p));
      cycle = remaining.length
        ? {
            number: previous.number,
            startDate: todayKey,
            days: rotateCycleDays(buildCycleDays(remaining, draft.objective), draft.startPage),
          }
        : {
            number: previous.number + 1,
            startDate: todayKey,
            days: rotateCycleDays(buildCycleDays(pages, draft.objective), draft.startPage),
          };
    }
  } else {
    cycle = {
      number: previous ? previous.number + (previous.startDate === todayKey ? 0 : 1) : 1,
      startDate: todayKey,
      days: rotateCycleDays(buildCycleDays(pages, draft.objective), draft.startPage),
    };
  }

  saveProgram(program);
  saveCycle(cycle);
  // Sauver l'acquis du jour dans le journal AVANT la remise à zéro : la
  // journée reconstruite ressèmera ces pages comme récitées.
  archiveToday(now);
  clearDayState();
  clearDraft();
  return { program, cycle };
}
