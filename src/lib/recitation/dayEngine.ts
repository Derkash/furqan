// Chef d'orchestre de la journée : fait le lien entre le moteur pur, le
// stockage et l'UI/widget. Seul module autorisé à lire l'horloge (via le
// paramètre `now` passé par l'appelant) et à écrire dans le store.
//
// Cycle de vie :
//   ensureToday(now)   → charge/clôture/reconstruit l'état du jour
//   markRecited(...)   → coche une page, clôt le créneau si complet
//   tick(now)          → clôt les créneaux passés, applique les reports
//   applyCarryOver(...)→ décision de report (mode « toujours demander »)

import {
  DEFAULT_MIN_PER_PAGE,
  buildCycleDays,
  carryOverPages,
  splitPagesAcrossSlots,
  splitPagesCustom,
} from './planner';
import {
  cycleDayDates,
  slotsForWeekday,
  toDateKey,
  weekdayOf,
} from './schedule';
import { buildLearningSlot } from './learning';
import { reinforcementDuePages } from './mastery';
import {
  clearDayState,
  evaluationsByPage,
  loadCycle,
  loadDayState,
  loadEvaluations,
  loadProgram,
  loadSessions,
  appendSession,
  saveCycle,
  saveDayState,
} from './store';
import type {
  Cycle,
  DayState,
  PlannedSlot,
  Program,
  SessionRecord,
  SessionStatus,
  SlotKind,
} from './types';

export interface TodayContext {
  program: Program;
  cycle: Cycle;
  dayState: DayState | null; // null = jour inactif (repos)
  todayKey: string;
  /** Dates planifiées de chaque jour du cycle courant. */
  dayDates: string[];
  /** Journées passées du cycle sans aucune session enregistrée (retard). */
  missedDates: string[];
}

// ---------------------------------------------------------------------------
// Construction d'une journée
// ---------------------------------------------------------------------------

/** Pages prévues d'un jour du cycle + renforcement + rattrapage en tête. */
function pagesForDay(
  program: Program,
  cycle: Cycle,
  cycleDayIndex: number,
  todayKey: string,
  catchUp: number[]
): { pages: number[]; reinforcement: number[] } {
  const base = cycle.days[cycleDayIndex]?.pages ?? [];
  let reinforcement: number[] = [];
  if (program.reinforcementEnabled) {
    const evals = evaluationsByPage(loadEvaluations());
    reinforcement = reinforcementDuePages(evals, todayKey, new Set(base)).filter(
      (p) => !catchUp.includes(p)
    );
  }
  // Ordre : renforcement d'abord (brief §9 : début du prochain créneau),
  // puis rattrapage, puis le programme du jour — sans doublon.
  const pages = carryOverPages([...reinforcement, ...catchUp], base);
  return { pages, reinforcement };
}

function buildDayState(
  program: Program,
  cycle: Cycle,
  todayKey: string,
  cycleDayIndex: number,
  catchUp: number[]
): DayState {
  const slots = slotsForWeekday(program.schedule, weekdayOf(todayKey));
  const { pages, reinforcement } = pagesForDay(program, cycle, cycleDayIndex, todayKey, catchUp);
  const planned: PlannedSlot[] = (
    program.slotSplit.mode === 'custom'
      ? splitPagesCustom(pages, slots, program.slotSplit.pagesPerSlot)
      : splitPagesAcrossSlots(pages, slots)
  ).map((s) => ({ ...s, kind: 'cycle' as SlotKind }));

  // Séance de la sourate en cours (lâhiq) : à part, jamais fondue dans le
  // cycle. Insérée à sa place chronologique parmi les créneaux.
  const learning = buildLearningSlot(program.learning, program.schedule, program.createdAt, todayKey);
  const all = learning ? [...planned, learning].sort((a, b) => a.startMin - b.startMin) : planned;

  return {
    date: todayKey,
    cycleDayIndex,
    slots: all,
    recitedPages: [],
    learningRecited: [],
    pendingEvaluations: [],
    closedSlots: [],
    pendingCarryOver: null,
    reinforcementPages: reinforcement,
    pendingCatchUp: [],
  };
}

// ---------------------------------------------------------------------------
// Clôture d'un créneau / d'une journée
// ---------------------------------------------------------------------------

/** Ensemble des pages récitées applicable à un créneau, selon sa nature. */
function recitedFor(state: DayState, kind: SlotKind | undefined): Set<number> {
  return new Set(kind === 'learning' ? (state.learningRecited ?? []) : state.recitedPages);
}

function slotStatus(slot: PlannedSlot, recited: Set<number>): SessionStatus {
  if (!slot.pages.length) return 'done';
  const done = slot.pages.filter((p) => recited.has(p)).length;
  if (done === slot.pages.length) return 'done';
  return done > 0 ? 'partial' : 'missed';
}

/** Journalise un créneau (une seule fois) et renvoie ses pages restantes. */
function closeSlot(state: DayState, slotIndex: number, carried: number[]): number[] {
  const slot = state.slots[slotIndex];
  if (!slot || state.closedSlots.includes(slotIndex)) return [];
  const recited = recitedFor(state, slot.kind);
  const remaining = slot.pages.filter((p) => !recited.has(p));
  const record: SessionRecord = {
    date: state.date,
    slot: { startMin: slot.startMin, endMin: slot.endMin },
    kind: slot.kind ?? 'cycle',
    plannedPages: slot.pages,
    recitedPages: slot.pages.filter((p) => recited.has(p)),
    status: slotStatus(slot, recited),
    carriedOver: carried,
  };
  appendSession(record);
  state.closedSlots.push(slotIndex);
  return remaining;
}

/** Clôture TOUS les créneaux restants d'une journée passée (jamais reportés). */
function closePastDay(state: DayState): void {
  for (let i = 0; i < state.slots.length; i++) closeSlot(state, i, []);
}

/**
 * Pages non récitées d'une journée pour le rattrapage. Seul le CYCLE est
 * rattrapé : la sourate en cours se récite le jour même ou pas du tout —
 * la reporter reviendrait à doubler la séance du lendemain.
 */
function unrecitedPages(state: DayState): number[] {
  const recited = new Set(state.recitedPages);
  const all = state.slots.filter((s) => s.kind !== 'learning').flatMap((s) => s.pages);
  return [...new Set(all.filter((p) => !recited.has(p)))];
}

// ---------------------------------------------------------------------------
// ensureToday : point d'entrée principal
// ---------------------------------------------------------------------------

/**
 * Garantit un état du jour cohérent pour `now` :
 * - clôt (journalise) une éventuelle journée précédente restée ouverte ;
 * - avance dans le cycle (jours actifs uniquement) et bascule sur un nouveau
 *   cycle quand le précédent est terminé ;
 * - détecte les journées manquées (brief §16 — l'UI propose alors les options).
 * Renvoie null si aucun programme n'est enregistré.
 */
export function ensureToday(now: Date): TodayContext | null {
  const program = loadProgram();
  let cycle = loadCycle();
  if (!program || !cycle) return null;

  const todayKey = toDateKey(now);
  let state = loadDayState();
  let catchUp: number[] = [];

  // 1. Journée précédente restée ouverte → clôture. Les pages restantes ne
  // sont reprises aujourd'hui QUE si le report automatique est choisi —
  // brief §16 : ne jamais surcharger la journée sans l'accord de l'utilisateur.
  if (state && state.date !== todayKey) {
    const leftover = unrecitedPages(state);
    closePastDay(state);
    saveDayState(state); // closedSlots à jour (évite une double journalisation)
    catchUp = program.carryOver === 'auto' ? [...leftover, ...(state.pendingCatchUp ?? [])] : [];
    state = null;
  }

  // 2. Dates planifiées du cycle courant.
  let dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);

  // 3. Cycle terminé ? (toutes les dates passées) → nouveau cycle dès aujourd'hui.
  if (dayDates.length && dayDates[dayDates.length - 1] < todayKey) {
    const nextNumber = cycle.number + 1;
    const days = buildCycleDays(program.perimeterPages, program.objective);
    cycle = { number: nextNumber, startDate: todayKey, days };
    saveCycle(cycle);
    dayDates = cycleDayDates(program.schedule, todayKey, days.length);
  }

  // 4. Index du jour courant dans le cycle.
  const todayIndex = dayDates.indexOf(todayKey);

  // 5. Journées passées du cycle sans session (retard à signaler à l'UI).
  const sessions = loadSessionDates();
  const missedDates = dayDates.filter((d) => d < todayKey && !sessions.has(d));

  // 6. Jour inactif : pas d'état du jour (repos), l'UI affiche la prochaine date.
  if (todayIndex === -1) {
    return { program, cycle, dayState: null, todayKey, dayDates, missedDates };
  }

  // 7. Construire l'état du jour s'il n'existe pas encore.
  if (!state) {
    state = buildDayState(program, cycle, todayKey, todayIndex, catchUp);
    saveDayState(state);
  }

  return { program, cycle, dayState: state, todayKey, dayDates, missedDates };
}

function loadSessionDates(): Set<string> {
  return new Set(loadSessions().map((s) => s.date));
}

// ---------------------------------------------------------------------------
// Reconstruction de la journée sans perdre la progression
// ---------------------------------------------------------------------------

/**
 * Recalcule les créneaux du jour depuis le programme courant (après ajout ou
 * modification de la sourate en cours, par exemple) EN CONSERVANT ce qui a
 * déjà été fait aujourd'hui : pages récitées, évaluations en attente, et les
 * créneaux déjà clôturés — repérés par leurs horaires et non par leur index,
 * qui change quand une séance s'insère.
 *
 * Effacer purement l'état du jour ferait perdre la récitation du matin dès
 * qu'on touche au programme l'après-midi.
 */
export function rebuildToday(now: Date): TodayContext | null {
  const program = loadProgram();
  const cycle = loadCycle();
  const previous = loadDayState();
  if (!program || !cycle) return null;

  const todayKey = toDateKey(now);
  if (!previous || previous.date !== todayKey) {
    clearDayState();
    return ensureToday(now);
  }

  const dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const index = dayDates.indexOf(todayKey);
  if (index === -1) {
    clearDayState();
    return ensureToday(now);
  }

  const fresh = buildDayState(program, cycle, todayKey, index, previous.pendingCatchUp ?? []);
  const closedSignatures = new Set(
    previous.closedSlots.map((i) => {
      const slot = previous.slots[i];
      return slot ? `${slot.startMin}-${slot.endMin}` : '';
    })
  );
  const merged: DayState = {
    ...fresh,
    recitedPages: previous.recitedPages,
    learningRecited: previous.learningRecited ?? [],
    pendingEvaluations: previous.pendingEvaluations,
    pendingCarryOver: previous.pendingCarryOver,
    closedSlots: fresh.slots
      .map((slot, i) => (closedSignatures.has(`${slot.startMin}-${slot.endMin}`) ? i : -1))
      .filter((i) => i >= 0),
  };
  saveDayState(merged);
  return ensureToday(now);
}

// ---------------------------------------------------------------------------
// Charge de la journée
// ---------------------------------------------------------------------------

/** Volume réellement demandé aujourd'hui : révision + sourate en cours. */
export interface DailyLoad {
  cyclePages: number;
  learningPages: number;
  totalPages: number;
  /** Durée estimée, toutes séances confondues. */
  estimatedMinutes: number;
  cycleDone: number;
  learningDone: number;
}

export function dailyLoad(state: DayState | null): DailyLoad {
  const empty: DailyLoad = {
    cyclePages: 0, learningPages: 0, totalPages: 0,
    estimatedMinutes: 0, cycleDone: 0, learningDone: 0,
  };
  if (!state) return empty;
  const cycleRecited = new Set(state.recitedPages);
  const learningRecited = new Set(state.learningRecited ?? []);
  let cyclePages = 0;
  let learningPages = 0;
  let cycleDone = 0;
  let learningDone = 0;
  for (const slot of state.slots) {
    if (slot.kind === 'learning') {
      learningPages += slot.pages.length;
      learningDone += slot.pages.filter((p) => learningRecited.has(p)).length;
    } else {
      cyclePages += slot.pages.length;
      cycleDone += slot.pages.filter((p) => cycleRecited.has(p)).length;
    }
  }
  const total = cyclePages + learningPages;
  return {
    cyclePages,
    learningPages,
    totalPages: total,
    estimatedMinutes: total * DEFAULT_MIN_PER_PAGE,
    cycleDone,
    learningDone,
  };
}

/**
 * Chevauchement entre la séance d'apprentissage et un créneau de révision :
 * deux séances au même moment rendraient l'affichage ambigu (laquelle est
 * « en cours » ?). L'UI s'en sert pour prévenir.
 */
export function learningOverlapsCycle(state: DayState | null): boolean {
  if (!state) return false;
  const learning = state.slots.find((s) => s.kind === 'learning');
  if (!learning) return false;
  return state.slots.some(
    (s) =>
      s.kind !== 'learning' &&
      s.pages.length > 0 &&
      s.startMin < learning.endMin &&
      learning.startMin < s.endMin
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Coche/décoche une page récitée. Le suivi est SÉPARÉ selon la nature de la
 * séance : avoir récité une page en révision ne la valide pas dans la sourate
 * en cours, et inversement.
 */
export function setPageRecited(
  state: DayState,
  page: number,
  recited: boolean,
  kind: SlotKind = 'cycle'
): DayState {
  const source = kind === 'learning' ? (state.learningRecited ?? []) : state.recitedPages;
  const set = new Set(source);
  const pending = new Set(state.pendingEvaluations);
  if (recited) {
    set.add(page);
    pending.add(page);
  } else {
    set.delete(page);
    pending.delete(page);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const next: DayState = {
    ...state,
    ...(kind === 'learning' ? { learningRecited: sorted } : { recitedPages: sorted }),
    pendingEvaluations: [...pending].sort((a, b) => a - b),
  };
  saveDayState(next);
  return next;
}

/** Retire une page de la liste « à évaluer » (évaluée ou passée). */
export function clearPendingEvaluation(state: DayState, page: number): DayState {
  const next: DayState = {
    ...state,
    pendingEvaluations: state.pendingEvaluations.filter((p) => p !== page),
  };
  saveDayState(next);
  return next;
}

/**
 * Fait vivre la journée : clôt les créneaux terminés (endMin ≤ now) et applique
 * la politique de report. En mode « toujours demander », le report est mis en
 * attente (`pendingCarryOver`) pour que l'UI pose la question.
 */
export function tick(program: Program, state: DayState, now: Date): DayState {
  if (toDateKey(now) !== state.date) return state; // minuit passé : ensureToday s'en charge
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next: DayState = { ...state, slots: state.slots.map((s) => ({ ...s })), closedSlots: [...state.closedSlots] };
  let changed = false;

  for (let i = 0; i < next.slots.length; i++) {
    const slot = next.slots[i];
    if (slot.endMin > nowMin || next.closedSlots.includes(i)) continue;
    const recited = recitedFor(next, slot.kind);
    const remaining = slot.pages.filter((p) => !recited.has(p));
    changed = true;

    // La séance d'apprentissage ne se reporte pas : on la clôt telle quelle.
    if (slot.kind === 'learning') {
      closeSlot(next, i, []);
      continue;
    }

    if (!remaining.length || program.carryOver === 'never' || i === next.slots.length - 1) {
      closeSlot(next, i, []);
      continue;
    }
    if (program.carryOver === 'auto') {
      closeSlot(next, i, remaining);
      next.slots[i + 1] = {
        ...next.slots[i + 1],
        pages: carryOverPages(remaining, next.slots[i + 1].pages),
      };
      continue;
    }
    // 'ask' : on clôt le créneau mais la décision de report revient à l'UI.
    if (!next.pendingCarryOver) {
      closeSlot(next, i, []);
      next.pendingCarryOver = { fromSlot: i, pages: remaining };
    }
  }

  if (changed) saveDayState(next);
  return changed ? next : state;
}

/** Décision de l'utilisateur sur un report en attente (mode « demander »). */
export function resolveCarryOver(state: DayState, accept: boolean): DayState {
  const pending = state.pendingCarryOver;
  if (!pending) return state;
  const next: DayState = { ...state, slots: state.slots.map((s) => ({ ...s })), pendingCarryOver: null };
  if (accept) {
    const target = Math.min(pending.fromSlot + 1, next.slots.length - 1);
    next.slots[target] = {
      ...next.slots[target],
      pages: carryOverPages(pending.pages, next.slots[target].pages),
    };
  }
  saveDayState(next);
  return next;
}

/**
 * Traitement d'un retard (brief §16). `mode` :
 * - 'catch-up'  : répartir les pages manquées sur les créneaux restants du jour ;
 * - 'skip'      : reprendre aujourd'hui sans rattrapage (le cycle continue) ;
 * (le décalage du cycle est le comportement par défaut d'ensureToday).
 */
export function resolveMissedDays(
  program: Program,
  cycle: Cycle,
  state: DayState,
  missedDates: string[],
  mode: 'catch-up' | 'skip'
): DayState {
  if (mode === 'skip' || !missedDates.length) return state;
  // Pages des jours manqués = jours du cycle planifiés à ces dates.
  const dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const recited = new Set(state.recitedPages);
  const missedPages: number[] = [];
  for (const d of missedDates) {
    const idx = dayDates.indexOf(d);
    if (idx >= 0) for (const p of cycle.days[idx].pages) if (!recited.has(p)) missedPages.push(p);
  }
  if (!missedPages.length) return state;
  // Répartition limitée : au plus +50 % de pages par créneau restant (pas de surcharge).
  const next: DayState = { ...state, slots: state.slots.map((s) => ({ ...s })) };
  const openSlots = next.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.kind !== 'learning' && !next.closedSlots.includes(i));
  if (!openSlots.length) return state;
  const queue = [...new Set(missedPages)];
  for (const { s, i } of openSlots) {
    if (!queue.length) break;
    const cap = Math.max(1, Math.ceil(s.pages.length * 0.5));
    const take = queue.splice(0, cap);
    next.slots[i] = { ...s, pages: carryOverPages(take, s.pages) };
  }
  // Le surplus reste en attente pour demain.
  next.pendingCatchUp = queue;
  saveDayState(next);
  return next;
}

// ---------------------------------------------------------------------------
// Lectures dérivées (affichage)
// ---------------------------------------------------------------------------

/** Pages du cycle courant déjà récitées (sessions passées + aujourd'hui). */
export function cycleProgress(cycle: Cycle, state: DayState | null): { recited: number; total: number } {
  const cyclePages = new Set(cycle.days.flatMap((d) => d.pages));
  const recited = new Set<number>();
  for (const s of loadSessions()) {
    if (s.kind === 'learning') continue; // la sourate en cours n'avance pas le cycle
    if (s.date >= cycle.startDate) for (const p of s.recitedPages) if (cyclePages.has(p)) recited.add(p);
  }
  if (state) for (const p of state.recitedPages) if (cyclePages.has(p)) recited.add(p);
  return { recited: recited.size, total: cyclePages.size };
}
