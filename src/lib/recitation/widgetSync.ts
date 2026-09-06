// Pont vers le natif iOS : widget d'écran d'accueil (WidgetKit) et activité en
// direct (ActivityKit).
//
// PRINCIPE : on ne pousse PAS « le créneau courant » mais la LISTE des
// prochaines sessions (aujourd'hui + les jours suivants du cycle), chacune
// avec ses bornes horaires en époque. Le widget choisit lui-même la session
// qui correspond à l'instant de rendu — il change donc de créneau, de pages et
// de versets tout seul, sans que l'application soit ouverte. C'est ce qui
// manquait : avant, un nouveau créneau n'apparaissait qu'après ouverture.
//
// Sur le web : no-op silencieux.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TodayContext } from './dayEngine';
import { pageRefLabel, pagesLabel } from './labels';
import { buildLearningSlot } from './learning';
import { passageHeads } from './passageText';
import { splitPagesAcrossSlots, splitPagesCustom } from './planner';
import { formatTime, slotsForWeekday, weekdayOf } from './schedule';

/** Nombre de jours du programme envoyés au widget (au-delà : resynchro). */
const HORIZON_DAYS = 3;
/** Sessions pour lesquelles on charge le texte des versets. */
const VERSE_LOOKAHEAD = 6;

/** Une occurrence de créneau, autonome pour l'affichage. */
export interface WidgetSession {
  startEpoch: number;
  endEpoch: number;
  slotLabel: string;   // « 11 h – 12 h »
  dayLabel: string;    // '' si aujourd'hui, sinon « mardi 8 septembre »
  pagesLabel: string;  // « 02/pages 1 à 4 »
  /** 'cycle' (révision) ou 'learning' (sourate en cours). */
  kind: string;
  /** Titre de la séance : « Récitation en cours » / « Sourate Al-Ma'idah ». */
  title: string;
  /** Repères de page en numérotation de sourate, pour les étiquettes. */
  firstPageLabel: string;
  lastPageLabel: string;
  firstPage: number;
  lastPage: number;
  totalPages: number;
  recitedPages: number;
  startVerse: string;  // début du premier verset (othmanien Unicode)
  endVerse: string;    // début du dernier verset
}

export interface WidgetState {
  generatedAt: number;
  /** Le retard reste-t-il dû (préférence de report ≠ « jamais ») ? */
  carryOverDue: boolean;
  sessions: WidgetSession[];
}

interface RecitationBridgePlugin {
  syncState(options: { state: string }): Promise<void>;
  startLiveActivity(options: { state: string }): Promise<void>;
  updateLiveActivity(options: { state: string }): Promise<void>;
  endLiveActivity(): Promise<void>;
}

const RecitationBridge = registerPlugin<RecitationBridgePlugin>('RecitationBridge');

function epochOf(dateKey: string, minutes: number): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime() / 1000);
}

function dayLabelOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function makeSession(
  dateKey: string,
  slot: { startMin: number; endMin: number; kind?: string },
  pages: number[],
  recited: Set<number>,
  isToday: boolean,
  learningSurah?: number
): WidgetSession {
  const isLearning = slot.kind === 'learning';
  const preferred = isLearning ? learningSurah : undefined;
  const first = pages[0] ?? 0;
  const last = pages[pages.length - 1] ?? 0;
  return {
    startEpoch: epochOf(dateKey, slot.startMin),
    endEpoch: epochOf(dateKey, slot.endMin),
    slotLabel: `${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`,
    dayLabel: isToday ? '' : dayLabelOf(dateKey),
    pagesLabel: pagesLabel(pages, preferred),
    kind: isLearning ? 'learning' : 'cycle',
    title: isLearning ? 'Sourate en cours' : 'Récitation en cours',
    firstPageLabel: first ? pageRefLabel(first, preferred) : '',
    lastPageLabel: last ? pageRefLabel(last, preferred) : '',
    firstPage: first,
    lastPage: last,
    totalPages: pages.length,
    recitedPages: pages.filter((p) => recited.has(p)).length,
    startVerse: '',
    endVerse: '',
  };
}

/**
 * Sessions d'aujourd'hui (état réel, reports et renforcement compris) puis
 * des jours suivants du cycle (projection depuis l'objectif et les horaires).
 */
export function buildSessions(ctx: TodayContext | null): WidgetSession[] {
  if (!ctx) return [];
  const { program, cycle, dayState, todayKey, dayDates } = ctx;
  const sessions: WidgetSession[] = [];

  const learningSurah = program.learning?.surah;
  if (dayState) {
    const cycleRecited = new Set(dayState.recitedPages);
    const learningRecited = new Set(dayState.learningRecited ?? []);
    for (const slot of dayState.slots) {
      if (!slot.pages.length) continue;
      const recited = slot.kind === 'learning' ? learningRecited : cycleRecited;
      sessions.push(makeSession(todayKey, slot, slot.pages, recited, true, learningSurah));
    }
  }

  const upcomingDates = dayDates.filter((d) => d > todayKey).slice(0, HORIZON_DAYS);
  for (const date of upcomingDates) {
    const idx = dayDates.indexOf(date);
    const pages = cycle.days[idx]?.pages ?? [];
    if (!pages.length) continue;
    const slots = slotsForWeekday(program.schedule, weekdayOf(date));
    if (!slots.length) continue;
    const planned =
      program.slotSplit.mode === 'custom'
        ? splitPagesCustom(pages, slots, program.slotSplit.pagesPerSlot)
        : splitPagesAcrossSlots(pages, slots);
    for (const slot of planned) {
      if (slot.pages.length) sessions.push(makeSession(date, slot, slot.pages, new Set(), false, learningSurah));
    }
    // La sourate en cours se récite aussi les jours suivants.
    const learn = buildLearningSlot(program.learning, program.schedule, program.createdAt, date);
    if (learn) sessions.push(makeSession(date, learn, learn.pages, new Set(), false, learningSurah));
  }

  return sessions.sort((a, b) => a.startEpoch - b.startEpoch);
}

/** Contenu de l'activité en direct (miroir du ContentState Swift). */
export interface LiveContent {
  /** 'active' | 'overdue' | 'upcoming' — l'écran verrouillé couvre TOUT. */
  phase: string;
  /** Pages dues maintenant (retard compris pour le cycle). */
  dueCount: number;
  recitedPages: number;
  totalPages: number;
  pagesLabel: string;
  /** Époque de référence du décompte : fin du créneau actif, ou début du prochain. */
  refEpoch: number;
  slotLabel: string;
  startVerse: string;
}

function endOfToday(now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return Math.floor(end.getTime() / 1000);
}

/**
 * L'activité en direct doit être là DÈS qu'une récitation est due ou à venir
 * aujourd'hui — pas seulement pendant un créneau. iOS n'autorise le démarrage
 * qu'app ouverte : on la démarre donc à la première occasion (lancement,
 * retour au premier plan) et on ne la termine qu'une fois la journée pliée.
 */
export function buildLiveContent(state: WidgetState, now: Date): LiveContent | null {
  const t = Math.floor(now.getTime() / 1000);
  const today = state.sessions.filter((s) => s.startEpoch < endOfToday(now));
  const active = today.find((s) => t >= s.startEpoch && t < s.endEpoch) ?? null;
  const next = today.find((s) => s.startEpoch > t) ?? null;
  // Retard cumulé : pages restantes des sessions passées (si la préférence
  // les garde dues). Les sessions portent leur avancement.
  const overdue = state.carryOverDue
    ? today
        .filter((s) => s.endEpoch <= t)
        .reduce((sum, s) => sum + Math.max(0, s.totalPages - s.recitedPages), 0)
    : 0;

  if (active && active.recitedPages < active.totalPages) {
    return {
      phase: 'active',
      dueCount: active.totalPages - active.recitedPages + (active.kind === 'cycle' ? overdue : 0),
      recitedPages: active.recitedPages,
      totalPages: active.totalPages,
      pagesLabel: active.pagesLabel,
      refEpoch: active.endEpoch,
      slotLabel: active.slotLabel,
      startVerse: active.startVerse,
    };
  }
  if (overdue > 0) {
    return {
      phase: 'overdue',
      dueCount: overdue,
      recitedPages: 0,
      totalPages: overdue,
      pagesLabel: next ? `Prochaine séance ${next.slotLabel}` : 'À rattraper avant ce soir',
      refEpoch: next?.startEpoch ?? endOfToday(now),
      slotLabel: next?.slotLabel ?? '',
      startVerse: '',
    };
  }
  if (next) {
    return {
      phase: 'upcoming',
      dueCount: next.totalPages,
      recitedPages: 0,
      totalPages: next.totalPages,
      pagesLabel: next.pagesLabel,
      refEpoch: next.startEpoch,
      slotLabel: next.slotLabel,
      startVerse: next.startVerse,
    };
  }
  return null; // journée pliée : plus rien de dû ni de prévu aujourd'hui
}

let lastPayload = '';
let lastLivePayload = '';
let liveActivityRunning = false;

/** Dernière erreur du pont natif — affichée par l'écran Diagnostic. */
const NATIVE_ERROR_KEY = 'almuraja3a:recitation:nativeError';
function recordNativeError(context: string, e: unknown): void {
  try {
    window.localStorage.setItem(
      NATIVE_ERROR_KEY,
      JSON.stringify({ context, message: String(e), at: new Date().toISOString() })
    );
  } catch {}
}
export function getNativeError(): { context: string; message: string; at: string } | null {
  try {
    const raw = window.localStorage.getItem(NATIVE_ERROR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function push(state: WidgetState, now: Date): void {
  const payload = JSON.stringify(state);
  if (payload !== lastPayload) {
    lastPayload = payload;
    RecitationBridge.syncState({ state: payload }).catch((e) => recordNativeError('widget', e));
  }
  const live = buildLiveContent(state, now);
  if (live) {
    const body = JSON.stringify(live);
    if (body !== lastLivePayload || !liveActivityRunning) {
      lastLivePayload = body;
      const call = liveActivityRunning
        ? RecitationBridge.updateLiveActivity({ state: body })
        : RecitationBridge.startLiveActivity({ state: body });
      liveActivityRunning = true;
      call.catch((e) => {
        liveActivityRunning = false;
        recordNativeError('liveActivity', e);
      });
    }
  } else if (liveActivityRunning) {
    liveActivityRunning = false;
    lastLivePayload = '';
    RecitationBridge.endLiveActivity().catch((e) => recordNativeError('endLiveActivity', e));
  }
}

/** Session en cours à l'instant donné (bornes en époque). */
export function sessionAt(sessions: WidgetSession[], now: Date): WidgetSession | null {
  const t = Math.floor(now.getTime() / 1000);
  return sessions.find((s) => t >= s.startEpoch && t < s.endEpoch) ?? null;
}

/**
 * Synchronise widget + activité en direct. Les textes arabes sont chargés en
 * arrière-plan puis poussés dans une seconde synchro : le widget n'attend
 * jamais après eux.
 */
export function syncNative(ctx: TodayContext | null, now: Date): void {
  if (!Capacitor.isNativePlatform()) return;
  const sessions = buildSessions(ctx);
  const carryOverDue = ctx
    ? ctx.program.carryOver === 'auto' ||
      (ctx.program.carryOver === 'ask' && ctx.dayState?.overdueDecision === 'accepted')
    : false;
  const state: WidgetState = {
    generatedAt: Math.floor(now.getTime() / 1000),
    carryOverDue,
    sessions,
  };
  push(state, now);

  // Versets des prochaines sessions (mise en cache : les pages se répètent).
  const toLoad = sessions
    .filter((s) => s.endEpoch >= state.generatedAt)
    .slice(0, VERSE_LOOKAHEAD)
    .filter((s) => s.firstPage > 0);
  if (!toLoad.length) return;
  Promise.all(toLoad.map((s) => passageHeads(s.firstPage, s.lastPage, 14)))
    .then((heads) => {
      const enriched = sessions.map((s) => {
        const i = toLoad.indexOf(s);
        return i === -1 ? s : { ...s, startVerse: heads[i].start, endVerse: heads[i].end };
      });
      const next: WidgetState = { ...state, sessions: enriched };
      push(next, now);
    })
    .catch(() => {});
}
