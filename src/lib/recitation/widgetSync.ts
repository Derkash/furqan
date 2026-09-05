// Pont vers le natif iOS : widget d'écran d'accueil (WidgetKit) et activité en
// direct sur l'écran verrouillé (ActivityKit). Le plugin Swift `RecitationBridge`
// écrit l'état dans l'App Group partagé puis recharge les timelines — le compte
// à rebours, lui, est rendu côté widget avec Text(timerInterval:) : AUCUNE
// recharge périodique n'est nécessaire, on ne synchronise que sur événement
// (page cochée, créneau démarré/terminé). Sur le web : no-op silencieux.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { currentSlot, formatTime, nextSlot } from './schedule';
import type { DayState, Program } from './types';

/** État partagé avec le widget (JSON écrit dans l'App Group). */
export interface WidgetState {
  /** 'active' = créneau en cours ; 'upcoming' = prochaine session ; 'idle'. */
  phase: 'active' | 'upcoming' | 'idle';
  date: string;
  slotStartMin: number;
  slotEndMin: number;
  /** Époque (secondes) de fin du créneau — pour Text(timerInterval:). */
  slotEndEpoch: number;
  totalPages: number;
  recitedPages: number;
  firstPage: number;
  lastPage: number;
  /** Libellé prêt à afficher, ex. « Pages 3 à 6 ». */
  pagesLabel: string;
  /** Libellé du créneau, ex. « 18 h – 19 h ». */
  slotLabel: string;
}

interface RecitationBridgePlugin {
  /** Écrit l'état dans l'App Group + WidgetCenter.reloadAllTimelines(). */
  syncState(options: { state: string }): Promise<void>;
  startLiveActivity(options: { state: string }): Promise<void>;
  updateLiveActivity(options: { state: string }): Promise<void>;
  endLiveActivity(): Promise<void>;
}

const RecitationBridge = registerPlugin<RecitationBridgePlugin>('RecitationBridge');

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function pagesLabel(pages: number[]): string {
  if (!pages.length) return '';
  const first = pages[0];
  const last = pages[pages.length - 1];
  return first === last ? `Page ${first}` : `Pages ${first} à ${last}`;
}

/** Construit l'état widget à partir de la journée (créneau courant ou prochain). */
export function buildWidgetState(state: DayState | null, now: Date): WidgetState {
  const idle: WidgetState = {
    phase: 'idle', date: '', slotStartMin: 0, slotEndMin: 0, slotEndEpoch: 0,
    totalPages: 0, recitedPages: 0, firstPage: 0, lastPage: 0, pagesLabel: '', slotLabel: '',
  };
  if (!state) return idle;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = currentSlot(state.slots, nowMin);
  const upcoming = nextSlot(state.slots, nowMin);
  const slot = current ?? upcoming;
  if (!slot) return idle;
  const planned = state.slots.find((s) => s.startMin === slot.startMin);
  const pages = planned?.pages ?? [];
  const recited = new Set(state.recitedPages);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return {
    phase: current ? 'active' : 'upcoming',
    date: state.date,
    slotStartMin: slot.startMin,
    slotEndMin: slot.endMin,
    slotEndEpoch: Math.floor(midnight.getTime() / 1000) + slot.endMin * 60,
    totalPages: pages.length,
    recitedPages: pages.filter((p) => recited.has(p)).length,
    firstPage: pages[0] ?? 0,
    lastPage: pages[pages.length - 1] ?? 0,
    pagesLabel: pagesLabel(pages),
    slotLabel: `${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`,
  };
}

let lastPayload = '';
let liveActivityRunning = false;

/**
 * Synchronise widget + activité en direct avec l'état du jour. À appeler après
 * chaque événement (page cochée, tick de créneau, programme modifié).
 */
export function syncNative(program: Program | null, state: DayState | null, now: Date): void {
  if (!isNative()) return;
  const widget = buildWidgetState(program ? state : null, now);
  const payload = JSON.stringify(widget);
  if (payload !== lastPayload) {
    lastPayload = payload;
    RecitationBridge.syncState({ state: payload }).catch(() => {});
  }
  // Activité en direct : démarrée pendant un créneau actif, mise à jour à
  // chaque page, terminée quand le créneau est fini ou tout est récité.
  const active = widget.phase === 'active' && widget.totalPages > 0;
  const finished = widget.recitedPages >= widget.totalPages;
  if (active && !finished) {
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
