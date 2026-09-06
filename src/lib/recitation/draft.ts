// Brouillon de configuration du programme : les quatre écrans de mise en place
// (périmètre → objectif → horaires → répartition) lisent/écrivent ce document
// localStorage, puis `finalizeProgram` le transforme en Program + Cycle.
// Modifier le programme plus tard réutilise le même brouillon, pré-rempli —
// l'historique (sessions, évaluations) n'est JAMAIS touché (brief §19).

import { archiveToday } from './dayEngine';
import { buildCycleDays } from './planner';
import { perimeterPages } from './perimeter';
import { toDateKey } from './schedule';
import { clearDayState, loadCycle, loadProgram, saveCycle, saveProgram } from './store';
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

/**
 * Valide le brouillon → Program + Cycle enregistrés. Le périmètre peut évoluer
 * sans perdre l'historique : seuls program/cycle/dayState sont remplacés.
 * Renvoie null si le brouillon est incomplet.
 */
export function finalizeProgram(draft: ProgramDraft, now: Date): { program: Program; cycle: Cycle } | null {
  if (!draft.selections.length || !draft.objective) return null;
  const pages = perimeterPages(draft.selections);
  if (!pages.length) return null;
  const nowIso = now.toISOString();
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
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  const previous = loadCycle();
  const cycle: Cycle = {
    number: previous ? previous.number + (previous.startDate === toDateKey(now) ? 0 : 1) : 1,
    startDate: toDateKey(now),
    days: buildCycleDays(pages, draft.objective),
  };
  saveProgram(program);
  saveCycle(cycle);
  // Sauver l'acquis du jour dans le journal AVANT la remise à zéro : la
  // journée reconstruite ressèmera ces pages comme récitées.
  archiveToday(now);
  clearDayState();
  clearDraft();
  return { program, cycle };
}
