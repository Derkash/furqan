// Notifications locales de récitation (brief §14) — trois moments par créneau :
//   1. à l'ouverture du créneau  : « C'est l'heure de votre récitation »
//   2. avant la fin (réglable)   : rappel du temps et des pages restantes
//   3. après la fin              : séance non terminée, invitation à reprendre
//
// Architecture : buildNotificationPlan() est PURE (testée par le script de
// vérification) ; scheduleRecitationNotifications() applique le plan.
// Contraintes réelles prises en compte :
//   - iOS plafonne à 64 notifications locales en attente : le plan est trié
//     par date et coupé à 60 — les plus proches d'abord, jamais de perte
//     silencieuse des rappels du jour ;
//   - la relance « séance non terminée » est ANNULÉE dès que la séance est
//     complétée (cancelSlotFollowUps) : on ne relance jamais quelqu'un qui a
//     récité ;
//   - chaque planification laisse une trace lisible (getScheduleMeta) pour
//     l'écran Diagnostic : quand, combien, de quand à quand.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { duePages } from './dayEngine';
import { buildLearningSlot } from './learning';
import { pagesLabel } from './labels';
import { splitPagesAcrossSlots, splitPagesCustom } from './planner';
import { addDays, cycleDayDates, formatTime, slotsForWeekday, toDateKey, weekdayOf } from './schedule';
import type { Cycle, DayState, PlannedSlot, Program } from './types';

/** Jours planifiés à l'avance (re-planifié à chaque ouverture). */
const HORIZON_DAYS = 3;
/** Plage d'identifiants réservée à la récitation. */
const ID_BASE = 730000;
const ID_SPAN = 10000;
/** iOS garde 64 notifications en attente : marge de sécurité. */
const MAX_PENDING = 60;

type Kind = 0 | 1 | 2; // 0 = début, 1 = avant la fin, 2 = relance après la fin

/** Identifiant déterministe : permet d'annuler un rappel précis plus tard. */
function notifId(dayOffset: number, slotIndex: number, kind: Kind): number {
  return ID_BASE + dayOffset * 300 + slotIndex * 10 + kind;
}

export interface PlannedNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
}

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

export async function cancelRecitationNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + ID_SPAN);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch {
    /* silencieux */
  }
}

/** Annule le rappel et la relance d'un créneau du jour dont l'objectif est atteint. */
export async function cancelSlotFollowUps(slotIndex: number): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notifId(0, slotIndex, 1) }, { id: notifId(0, slotIndex, 2) }],
    });
  } catch {
    /* silencieux */
  }
}

/** Créneaux planifiés d'une date (aujourd'hui : l'état réel du jour). */
function plannedSlotsFor(
  program: Program,
  cycle: Cycle,
  dayDates: string[],
  dateKey: string,
  dayState: DayState | null
): PlannedSlot[] {
  if (dayState && dayState.date === dateKey) return dayState.slots;
  const idx = dayDates.indexOf(dateKey);
  const pages = cycle.days[idx]?.pages ?? [];
  const slots = slotsForWeekday(program.schedule, weekdayOf(dateKey));
  const cycleSlots: PlannedSlot[] =
    pages.length && slots.length
      ? (program.slotSplit.mode === 'custom'
          ? splitPagesCustom(pages, slots, program.slotSplit.pagesPerSlot)
          : splitPagesAcrossSlots(pages, slots)
        ).map((s) => ({ ...s, kind: 'cycle' as const }))
      : [];
  const learning = buildLearningSlot(program.learning, program.schedule, program.createdAt, dateKey);
  return learning ? [...cycleSlots, learning].sort((a, b) => a.startMin - b.startMin) : cycleSlots;
}

/**
 * Plan complet des notifications à venir — PUR, sans I/O. Trié par date,
 * plafonné à MAX_PENDING (limite iOS de 64 en attente).
 */
export function buildNotificationPlan(
  program: Program,
  cycle: Cycle,
  now: Date,
  dayState: DayState | null
): PlannedNotification[] {
  if (!program.schedule.remindersEnabled) return [];
  const dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const todayKey = toDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const plan: PlannedNotification[] = [];
  const at = (dateKey: string, minutes: number) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
  };

  // Retard actuel du jour : mentionné dans les annonces des créneaux à venir
  // d'aujourd'hui (« + 2 pages en retard ») — on ne laisse jamais croire que
  // les pages manquées ont disparu.
  const overdueToday =
    dayState && dayState.date === todayKey
      ? duePages(program, dayState, nowMin, 'cycle').overdue.length
      : 0;

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const dateKey = addDays(todayKey, offset);
    const hasLearning = !!buildLearningSlot(program.learning, program.schedule, program.createdAt, dateKey);
    if (!dayDates.includes(dateKey) && !hasLearning) continue;
    const slots = plannedSlotsFor(program, cycle, dayDates, dateKey, dayState);

    slots.forEach((slot, i) => {
      if (!slot.pages.length) return;
      const isLearning = slot.kind === 'learning';
      const recited = new Set(
        offset === 0
          ? isLearning
            ? (dayState?.learningRecited ?? [])
            : (dayState?.recitedPages ?? [])
          : []
      );
      const remaining = slot.pages.filter((p) => !recited.has(p));
      if (!remaining.length) return; // séance déjà accomplie : aucun rappel
      const surah = isLearning ? program.learning?.surah : undefined;
      const label = pagesLabel(slot.pages, surah);
      const lateSuffix =
        offset === 0 && !isLearning && overdueToday > 0
          ? ` (+ ${overdueToday} page${overdueToday > 1 ? 's' : ''} en retard)`
          : '';

      // 1. Ouverture du créneau.
      const start = at(dateKey, slot.startMin);
      if (start > now) {
        plan.push({
          id: notifId(offset, i, 0),
          title: isLearning ? 'Votre sourate en cours' : 'C’est l’heure de votre récitation',
          body: `${label}${lateSuffix} — jusqu’à ${formatTime(slot.endMin)}. Qu’Allah vous facilite.`,
          at: start,
        });
      }

      // 2. Rappel avant la fin.
      if (program.endReminderMin != null) {
        const remindMin = slot.endMin - program.endReminderMin;
        const remindAt = at(dateKey, remindMin);
        if (remindAt > now && remindMin > slot.startMin) {
          plan.push({
            id: notifId(offset, i, 1),
            title: `Il reste ${program.endReminderMin} minutes`,
            body: `${remaining.length} page${remaining.length > 1 ? 's' : ''} à réciter avant ${formatTime(slot.endMin)} (${label}).`,
            at: remindAt,
          });
        }
      }

      // 3. Relance après la fin — annulée si la séance est accomplie.
      const followUpMin = slot.endMin + (program.endReminderMin ?? 15);
      if (followUpMin < 24 * 60) {
        const followUpAt = at(dateKey, followUpMin);
        if (followUpAt > now) {
          plan.push({
            id: notifId(offset, i, 2),
            title: 'Séance non terminée',
            body: `${label} — toujours à réciter aujourd’hui, rien n’est perdu. Reprenez quand vous pouvez.`,
            at: followUpAt,
          });
        }
      }
    });
  }

  return plan.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_PENDING);
}

// ---------------------------------------------------------------------------
// Application du plan + trace pour l'écran Diagnostic
// ---------------------------------------------------------------------------

const META_KEY = 'almuraja3a:recitation:notifMeta';

export interface ScheduleMeta {
  scheduledAt: string; // ISO — quand la planification a eu lieu
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  granted: boolean;
}

export function getScheduleMeta(): ScheduleMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as ScheduleMeta) : null;
  } catch {
    return null;
  }
}

function saveMeta(meta: ScheduleMeta): void {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {}
}

/** (Re)programme toutes les notifications. Idempotent : purge puis pose le plan. */
export async function scheduleRecitationNotifications(
  program: Program,
  cycle: Cycle,
  now: Date,
  dayState: DayState | null = null
): Promise<void> {
  if (!isNative()) return;
  await cancelRecitationNotifications();
  const granted = await ensureNotificationPermission();
  const plan = granted ? buildNotificationPlan(program, cycle, now, dayState) : [];

  if (plan.length) {
    try {
      await LocalNotifications.schedule({
        notifications: plan.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
          extra: { route: '/recitation/en-cours' },
        })),
      });
    } catch {
      /* silencieux — la méta gardera count posé à 0 ? Non : on garde le plan
         calculé, l'écart réel se lit dans Diagnostic via getPending. */
    }
  }
  saveMeta({
    scheduledAt: now.toISOString(),
    count: plan.length,
    firstAt: plan[0]?.at.toISOString() ?? null,
    lastAt: plan[plan.length - 1]?.at.toISOString() ?? null,
    granted,
  });
}
