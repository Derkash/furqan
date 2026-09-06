// Pont vers le natif iOS : widget d'écran d'accueil (WidgetKit) et activité en
// direct sur l'écran verrouillé (ActivityKit). Le plugin Swift `RecitationBridge`
// écrit l'état dans l'App Group partagé puis recharge les timelines — le compte
// à rebours, lui, est rendu côté widget : AUCUNE recharge périodique, on ne
// synchronise que sur événement (page cochée, créneau démarré/terminé).
// Sur le web : no-op silencieux.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TodayContext } from './dayEngine';
import { pagesLabel } from './labels';
import { passageHeads } from './passageText';
import { currentSlot, formatTime, nextSlot, slotsForWeekday, weekdayOf } from './schedule';

/** État partagé avec le widget (JSON écrit dans l'App Group). */
export interface WidgetState {
  /**
   * 'active'   : créneau en cours, pages restantes → progression + décompte
   * 'done'     : tout est récité → on n'affiche PLUS la progression mais la
   *              prochaine session (c'est la seule info utile à ce moment)
   * 'upcoming' : hors créneau → prochaine session
   * 'idle'     : aucun programme / plus rien de prévu
   */
  phase: 'active' | 'done' | 'upcoming' | 'idle';
  date: string;
  slotStartMin: number;
  slotEndMin: number;
  /** Époque (s) de fin du créneau en cours — décompte du widget. */
  slotEndEpoch: number;
  totalPages: number;
  recitedPages: number;
  firstPage: number;
  lastPage: number;
  pagesLabel: string;
  slotLabel: string;
  /** Début du premier verset à réciter (Unicode othmanien, tronqué). */
  startVerse: string;
  /** Début du dernier verset à réciter (Unicode othmanien, tronqué). */
  endVerse: string;
  // ---- Prochaine session (phases 'done' et 'upcoming') ----
  nextSlotLabel: string;
  nextPagesLabel: string;
  /** « aujourd'hui » ou « mardi 8 septembre » — vide si rien de prévu. */
  nextDayLabel: string;
}

interface RecitationBridgePlugin {
  syncState(options: { state: string }): Promise<void>;
  startLiveActivity(options: { state: string }): Promise<void>;
  updateLiveActivity(options: { state: string }): Promise<void>;
  endLiveActivity(): Promise<void>;
}

const RecitationBridge = registerPlugin<RecitationBridgePlugin>('RecitationBridge');

const IDLE: WidgetState = {
  phase: 'idle', date: '', slotStartMin: 0, slotEndMin: 0, slotEndEpoch: 0,
  totalPages: 0, recitedPages: 0, firstPage: 0, lastPage: 0,
  pagesLabel: '', slotLabel: '', startVerse: '', endVerse: '',
  nextSlotLabel: '', nextPagesLabel: '', nextDayLabel: '',
};

/** Première session à venir : plus tard aujourd'hui, sinon prochain jour actif. */
function findNext(ctx: TodayContext, nowMin: number): { label: string; pages: string; day: string } {
  const { program, cycle, dayState, todayKey, dayDates } = ctx;

  if (dayState) {
    const upcoming = dayState.slots.find((s) => s.startMin > nowMin && s.pages.length > 0);
    if (upcoming) {
      return { label: formatTime(upcoming.startMin), pages: pagesLabel(upcoming.pages), day: 'aujourd’hui' };
    }
  }

  // Prochaine journée planifiée du cycle.
  const nextDate = dayDates.find((d) => d > todayKey);
  if (!nextDate) return { label: '', pages: '', day: '' };
  const idx = dayDates.indexOf(nextDate);
  const pages = cycle.days[idx]?.pages ?? [];
  const slots = slotsForWeekday(program.schedule, weekdayOf(nextDate));
  const firstSlot = slots[0];
  const perSlot = slots.length ? Math.ceil(pages.length / slots.length) : pages.length;
  const [y, m, d] = nextDate.split('-').map(Number);
  const dayLabel = new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    label: firstSlot ? formatTime(firstSlot.startMin) : '',
    pages: pagesLabel(pages.slice(0, perSlot)),
    day: dayLabel,
  };
}

/** Construit l'état widget (hors textes arabes, chargés ensuite). */
export function buildWidgetState(ctx: TodayContext | null, now: Date): WidgetState {
  if (!ctx) return IDLE;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { dayState } = ctx;
  const next = findNext(ctx, nowMin);
  const base = { ...IDLE, nextSlotLabel: next.label, nextPagesLabel: next.pages, nextDayLabel: next.day };
  if (!dayState) return { ...base, phase: next.label ? 'upcoming' : 'idle' };

  const current = currentSlot(dayState.slots, nowMin);
  const later = nextSlot(dayState.slots, nowMin);
  const ref = current ?? later;
  if (!ref) return { ...base, phase: next.label ? 'upcoming' : 'idle', date: dayState.date };

  const planned = dayState.slots.find((s) => s.startMin === ref.startMin);
  const pages = planned?.pages ?? [];
  const recited = new Set(dayState.recitedPages);
  const doneCount = pages.filter((p) => recited.has(p)).length;
  const finished = pages.length > 0 && doneCount >= pages.length;

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  return {
    ...base,
    // Créneau en cours ET encore des pages → 'active'. Tout récité → 'done' :
    // le widget bascule sur la prochaine session, la progression n'a plus
    // d'intérêt une fois l'objectif atteint.
    phase: current ? (finished ? 'done' : 'active') : 'upcoming',
    date: dayState.date,
    slotStartMin: ref.startMin,
    slotEndMin: ref.endMin,
    slotEndEpoch: Math.floor(midnight.getTime() / 1000) + ref.endMin * 60,
    totalPages: pages.length,
    recitedPages: doneCount,
    firstPage: pages[0] ?? 0,
    lastPage: pages[pages.length - 1] ?? 0,
    pagesLabel: pagesLabel(pages),
    slotLabel: `${formatTime(ref.startMin)} – ${formatTime(ref.endMin)}`,
  };
}

let lastPayload = '';
let liveActivityRunning = false;

function push(state: WidgetState): void {
  const payload = JSON.stringify(state);
  if (payload !== lastPayload) {
    lastPayload = payload;
    RecitationBridge.syncState({ state: payload }).catch(() => {});
  }
  // Activité en direct : uniquement pendant un créneau actif non terminé.
  if (state.phase === 'active') {
    const call = liveActivityRunning
      ? RecitationBridge.updateLiveActivity({ state: payload })
      : RecitationBridge.startLiveActivity({ state: payload });
    liveActivityRunning = true;
    call.catch(() => {});
  } else if (liveActivityRunning) {
    liveActivityRunning = false;
    RecitationBridge.endLiveActivity().catch(() => {});
  }
}

/**
 * Synchronise widget + activité en direct. À appeler après chaque événement
 * (page cochée, tick de créneau, programme modifié). Les textes arabes sont
 * chargés en arrière-plan puis poussés dans une seconde synchro : le widget
 * n'attend jamais après eux.
 */
export function syncNative(ctx: TodayContext | null, now: Date): void {
  if (!Capacitor.isNativePlatform()) return;
  const state = buildWidgetState(ctx, now);
  push(state);
  if (state.firstPage > 0) {
    passageHeads(state.firstPage, state.lastPage)
      .then(({ start, end }) => {
        if (start || end) push({ ...state, startVerse: start, endVerse: end });
      })
      .catch(() => {});
  }
}
