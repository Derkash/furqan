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
  buildProgramCycleDays,
  carryOverPages,
  splitPagesAcrossSlots,
  splitPagesCustom,
} from './planner';
import {
  cycleDates,
  firstActiveDate,
  slotsForWeekday,
  startDateForIndex,
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
}

// ---------------------------------------------------------------------------
// Construction d'une journée
// ---------------------------------------------------------------------------

/**
 * Pages prévues d'un jour du cycle (moins celles déjà faites lors d'une
 * tentative précédente de cette même journée) + renforcement en tête.
 */
function pagesForDay(
  program: Program,
  cycle: Cycle,
  cycleDayIndex: number,
  todayKey: string,
  doneEarlier: number[]
): { pages: number[]; reinforcement: number[] } {
  const done = new Set(doneEarlier);
  const base = (cycle.days[cycleDayIndex]?.pages ?? []).filter((p) => !done.has(p));
  let reinforcement: number[] = [];
  if (program.reinforcementEnabled) {
    const evals = evaluationsByPage(loadEvaluations());
    reinforcement = reinforcementDuePages(evals, todayKey, new Set(base));
  }
  // Ordre : renforcement d'abord (brief §9 : début du prochain créneau),
  // puis le programme du jour — sans doublon.
  const pages = carryOverPages(reinforcement, base);
  return { pages, reinforcement };
}

/** Pages déjà récitées AUJOURD'HUI d'après le journal des séances closes. */
function recitedTodayFromJournal(todayKey: string): { cycle: number[]; learning: number[] } {
  const cycle = new Set<number>();
  const learning = new Set<number>();
  for (const rec of loadSessions()) {
    if (rec.date !== todayKey) continue;
    const target = rec.kind === 'learning' ? learning : cycle;
    for (const p of rec.recitedPages) target.add(p);
  }
  return { cycle: [...cycle].sort((a, b) => a - b), learning: [...learning].sort((a, b) => a - b) };
}

function buildDayState(
  program: Program,
  cycle: Cycle,
  todayKey: string,
  cycleDayIndex: number,
  doneEarlier: number[],
  resumed: boolean
): DayState {
  const slots = slotsForWeekday(program.schedule, weekdayOf(todayKey));
  const { pages, reinforcement } = pagesForDay(program, cycle, cycleDayIndex, todayKey, doneEarlier);
  const planned: PlannedSlot[] = (
    program.slotSplit.mode === 'custom'
      ? splitPagesCustom(pages, slots, program.slotSplit.pagesPerSlot)
      : splitPagesAcrossSlots(pages, slots)
  ).map((s) => ({ ...s, kind: 'cycle' as SlotKind }));

  // Séance de la sourate en cours (lâhiq) : à part, jamais fondue dans le
  // cycle. Insérée à sa place chronologique parmi les créneaux.
  const learning = buildLearningSlot(program.learning, program.schedule, program.createdAt, todayKey);
  const all = learning ? [...planned, learning].sort((a, b) => a.startMin - b.startMin) : planned;

  // INTÉGRITÉ : une journée reconstruite (programme modifié, resynchro…)
  // repart du journal — ce qui a été récité aujourd'hui reste récité.
  // C'est ce qui manquait quand « Modifier » remettait la journée à 0/20
  // alors que le cycle affichait déjà 12 pages faites.
  const seed = recitedTodayFromJournal(todayKey);

  return {
    date: todayKey,
    cycleDayIndex,
    slots: all,
    recitedPages: seed.cycle,
    learningRecited: seed.learning,
    pendingEvaluations: [],
    closedSlots: [],
    overdueDecision: null,
    reinforcementPages: reinforcement,
    doneEarlier,
    resumed,
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
 * Où reprendre après une journée passée : la journée suivante du cycle si
 * toutes ses pages ont été récitées (cette fois-ci ou lors d'une tentative
 * précédente), sinon LA MÊME journée, amputée de ce qui est déjà fait.
 * Seul le cycle compte : la sourate en cours se récite le jour même.
 */
function nextPosition(cycle: Cycle, state: DayState): { index: number; doneEarlier: number[]; resumed: boolean } {
  const index = Math.min(state.cycleDayIndex, cycle.days.length);
  const base = cycle.days[index]?.pages ?? [];
  const done = new Set([...(state.doneEarlier ?? []), ...state.recitedPages]);
  if (base.every((p) => done.has(p))) return { index: index + 1, doneEarlier: [], resumed: false };
  return { index, doneEarlier: base.filter((p) => done.has(p)), resumed: true };
}

// ---------------------------------------------------------------------------
// ensureToday : point d'entrée principal
// ---------------------------------------------------------------------------

/**
 * Garantit un état du jour cohérent pour `now` :
 * - clôt (journalise) une éventuelle journée précédente restée ouverte ;
 * - avance dans le cycle selon la PROGRESSION, jamais selon le calendrier :
 *   une journée non terminée est reprise le lendemain (seulement ce qui
 *   reste), et la suite du cycle glisse d'autant. Plusieurs jours sans
 *   ouvrir l'app → on reprend exactement où on s'était arrêté, sans pile
 *   de pages en retard ;
 * - bascule sur un nouveau cycle quand la dernière journée est terminée.
 * Renvoie null si aucun programme n'est enregistré.
 */
export function ensureToday(now: Date): TodayContext | null {
  const program = loadProgram();
  let cycle = loadCycle();
  if (!program || !cycle) return null;

  const todayKey = toDateKey(now);
  let state = loadDayState();
  let resume: ReturnType<typeof nextPosition> | null = null;

  // 1. Journée précédente restée ouverte → clôture, puis position de reprise.
  // L'état clos reste stocké jusqu'à la prochaine journée active : un jour de
  // repos recalcule la même reprise (idempotent).
  if (state && state.date !== todayKey) {
    closePastDay(state);
    saveDayState(state); // closedSlots à jour (évite une double journalisation)
    resume = nextPosition(cycle, state);
    state = null;
  }

  if (resume) {
    if (resume.index >= cycle.days.length) {
      // 2a. Dernière journée terminée → nouveau cycle. Le point de départ
      // choisi (« je commence par le juz 3 ») et la répétition valent pour
      // chaque cycle.
      cycle = {
        number: cycle.number + 1,
        startDate: todayKey,
        days: buildProgramCycleDays(program.perimeterPages, program.objective, program.startPage, program.repeatDays),
      };
      saveCycle(cycle);
      resume = { index: 0, doneEarlier: [], resumed: false };
    } else {
      // 2b. Recaler le calendrier : la journée à reprendre tombe au prochain
      // jour actif (aujourd'hui s'il l'est), la suite glisse derrière.
      const target = firstActiveDate(program.schedule, todayKey);
      const anchor = target ? startDateForIndex(program.schedule, target, resume.index) : null;
      if (anchor && anchor !== (cycle.anchorDate ?? cycle.startDate)) {
        cycle = { ...cycle, anchorDate: anchor };
        saveCycle(cycle);
      }
    }
  }

  let dayDates = cycleDates(program.schedule, cycle);

  // 3. Sans journée précédente connue (premier lancement, programme modifié) :
  // cycle entièrement passé → nouveau cycle dès aujourd'hui.
  if (!resume && dayDates.length && dayDates[dayDates.length - 1] < todayKey) {
    cycle = {
      number: cycle.number + 1,
      startDate: todayKey,
      days: buildProgramCycleDays(program.perimeterPages, program.objective, program.startPage, program.repeatDays),
    };
    saveCycle(cycle);
    dayDates = cycleDates(program.schedule, cycle);
  }

  // 4. Index du jour courant dans le cycle.
  const todayIndex = dayDates.indexOf(todayKey);

  // 5. Jour inactif : pas d'état du jour (repos), l'UI affiche la prochaine date.
  if (todayIndex === -1) {
    return { program, cycle, dayState: null, todayKey, dayDates };
  }

  // 6. Construire l'état du jour s'il n'existe pas encore.
  if (!state) {
    const carry = resume && resume.index === todayIndex ? resume : null;
    state = buildDayState(program, cycle, todayKey, todayIndex, carry?.doneEarlier ?? [], carry?.resumed ?? false);
    saveDayState(state);
  }

  return { program, cycle, dayState: state, todayKey, dayDates };
}

// ---------------------------------------------------------------------------
// Reconstruction de la journée sans perdre la progression
// ---------------------------------------------------------------------------

/**
 * Journalise les créneaux ouverts qui portent déjà des pages récitées.
 * À appeler AVANT clearDayState (modification du programme) : le journal
 * devient alors la mémoire du jour, et buildDayState la ressème.
 */
export function archiveToday(now: Date): void {
  const state = loadDayState();
  if (!state || state.date !== toDateKey(now)) return;
  const next: DayState = { ...state, closedSlots: [...state.closedSlots] };
  let changed = false;
  for (let i = 0; i < next.slots.length; i++) {
    if (next.closedSlots.includes(i)) continue;
    const slot = next.slots[i];
    const recited = recitedFor(next, slot.kind);
    if (!slot.pages.some((p) => recited.has(p))) continue;
    closeSlot(next, i, slot.pages.filter((p) => !recited.has(p)));
    changed = true;
  }
  if (changed) saveDayState(next);
}

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

  const dayDates = cycleDates(program.schedule, cycle);
  const index = dayDates.indexOf(todayKey);
  if (index === -1) {
    clearDayState();
    return ensureToday(now);
  }

  const sameDay = previous.cycleDayIndex === index;
  const fresh = buildDayState(
    program,
    cycle,
    todayKey,
    index,
    sameDay ? (previous.doneEarlier ?? []) : [],
    sameDay && !!previous.resumed
  );
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
    overdueDecision: previous.overdueDecision ?? null,
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

/**
 * Coche PLUSIEURS pages d'un coup (récitation improvisée) — une seule
 * écriture, sans passer par l'évaluation page à page.
 */
export function setPagesRecited(state: DayState, pages: number[], kind: SlotKind): DayState {
  const source = kind === 'learning' ? (state.learningRecited ?? []) : state.recitedPages;
  const set = new Set(source);
  for (const p of pages) set.add(p);
  const sorted = [...set].sort((a, b) => a - b);
  const next: DayState = {
    ...state,
    ...(kind === 'learning' ? { learningRecited: sorted } : { recitedPages: sorted }),
  };
  saveDayState(next);
  return next;
}

/**
 * RÉ-ÉTALE la journée après une récitation improvisée : toutes les pages de
 * révision restantes sont redistribuées équitablement sur les créneaux
 * encore ouverts (celui en cours compris). « 10 pages faites le matin →
 * une page par heure sur le reste de la journée. »
 *
 * Les créneaux passés sont délestés de leurs pages non récitées (reprises
 * dans la redistribution) : le retard affiché reste exact, sans doublon.
 * La séance de la sourate en cours n'est pas touchée.
 */
export function rebalanceToday(state: DayState, nowMin: number): DayState {
  const recited = new Set(state.recitedPages);
  const remaining = [
    ...new Set(
      state.slots
        .filter((s) => (s.kind ?? 'cycle') === 'cycle')
        .flatMap((s) => s.pages)
        .filter((p) => !recited.has(p))
    ),
  ].sort((a, b) => a - b);

  const open = state.slots
    .map((slot, i) => ({ slot, i }))
    .filter(
      ({ slot, i }) =>
        (slot.kind ?? 'cycle') === 'cycle' && slot.endMin > nowMin && !state.closedSlots.includes(i)
    );

  const slots = state.slots.map((slot) => ({ ...slot }));
  if (open.length) {
    const split = splitPagesAcrossSlots(
      remaining,
      open.map(({ slot }) => ({ startMin: slot.startMin, endMin: slot.endMin }))
    );
    open.forEach(({ i }, j) => {
      slots[i] = { ...slots[i], pages: split[j].pages };
    });
    // Les créneaux passés ne gardent que leurs pages récitées (journal) —
    // leurs restes viennent d'être redistribués devant.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if ((slot.kind ?? 'cycle') !== 'cycle' || slot.endMin > nowMin) continue;
      slots[i] = { ...slot, pages: slot.pages.filter((p) => recited.has(p)) };
    }
  }

  const next: DayState = { ...state, slots };
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
 * Fait vivre la journée : JOURNALISE les créneaux terminés (endMin ≤ now).
 * Rien d'autre — les pages ne sont jamais déplacées ni supprimées. Ce qui
 * reste à réciter se lit à tout instant via duePages() : une page d'un
 * créneau passé reste due jusqu'à minuit (selon la préférence de report).
 *
 * L'ancien report par MUTATION (fusionner les restes dans le créneau
 * suivant) jetait les pages du dernier créneau de la journée et pouvait
 * déverser des pages de révision dans la séance de sourate — d'où des
 * pages « sautées ». Le calcul du dû rend ces pertes impossibles.
 */
export function tick(_program: Program, state: DayState, now: Date): DayState {
  if (toDateKey(now) !== state.date) return state; // minuit passé : ensureToday s'en charge
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next: DayState = { ...state, closedSlots: [...state.closedSlots] };
  let changed = false;

  for (let i = 0; i < next.slots.length; i++) {
    const slot = next.slots[i];
    if (slot.endMin > nowMin || next.closedSlots.includes(i)) continue;
    const recited = recitedFor(next, slot.kind);
    // carriedOver du journal = ce qui reste dû après ce créneau.
    closeSlot(next, i, slot.pages.filter((p) => !recited.has(p)));
    changed = true;
  }

  if (changed) saveDayState(next);
  return changed ? next : state;
}

// ---------------------------------------------------------------------------
// Le dû : ce qu'il reste à réciter MAINTENANT
// ---------------------------------------------------------------------------

export interface DuePages {
  /** Pages du créneau (de cette nature) en cours, non récitées. */
  current: number[];
  /** Pages des créneaux passés, non récitées — le retard du jour. */
  overdue: number[];
  /** current + overdue, ordre du mushaf, sans doublon. */
  all: number[];
}

/**
 * Pages dues à cet instant pour une nature de séance. Le retard n'est
 * compté que si la préférence l'autorise : 'auto' toujours, 'ask' après
 * accord (overdueDecision), 'never' jamais (repris au cycle suivant).
 */
export function duePages(
  program: Program,
  state: DayState,
  nowMin: number,
  kind: SlotKind
): DuePages {
  const recited = recitedFor(state, kind);
  const includeOverdue =
    kind === 'learning'
      ? true // la sourate en cours se doit en entier jusqu'à minuit
      : program.carryOver === 'auto' ||
        (program.carryOver === 'ask' && state.overdueDecision === 'accepted');

  const current: number[] = [];
  const overdue: number[] = [];
  for (const slot of state.slots) {
    if ((slot.kind ?? 'cycle') !== kind) continue;
    if (slot.startMin > nowMin) continue; // pas encore commencé
    const target = slot.endMin <= nowMin ? overdue : current;
    for (const p of slot.pages) if (!recited.has(p)) target.push(p);
  }
  const kept = includeOverdue ? overdue : [];
  return {
    current: [...new Set(current)].sort((a, b) => a - b),
    overdue: [...new Set(kept)].sort((a, b) => a - b),
    all: [...new Set([...kept, ...current])].sort((a, b) => a - b),
  };
}

/** Y a-t-il un retard en attente de décision (mode « demander ») ? */
export function pendingOverdue(program: Program, state: DayState, nowMin: number): number[] {
  if (program.carryOver !== 'ask' || state.overdueDecision != null) return [];
  const recited = recitedFor(state, 'cycle');
  const late: number[] = [];
  for (const slot of state.slots) {
    if ((slot.kind ?? 'cycle') !== 'cycle' || slot.endMin > nowMin) continue;
    for (const p of slot.pages) if (!recited.has(p)) late.push(p);
  }
  return [...new Set(late)].sort((a, b) => a - b);
}

/** Décision sur le retard du jour (mode « demander »). */
export function resolveOverdue(state: DayState, accept: boolean): DayState {
  const next: DayState = { ...state, overdueDecision: accept ? 'accepted' : 'declined' };
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
