// Notifications locales de récitation (brief §14) — trois moments par créneau :
//   1. à l'ouverture du créneau  : « C'est l'heure de votre récitation »
//   2. avant la fin (réglable)   : rappel du temps et des pages restantes
//   3. après la fin              : séance non terminée, invitation à reprendre
//
// Le 3ᵉ message est programmé d'avance mais ANNULÉ dès que la séance est
// complétée (`cancelSlotFollowUps`) : on ne dit jamais « séance manquée » à
// quelqu'un qui a récité. Ton volontairement factuel et non culpabilisant,
// conformément au brief (§18 : « ne doit pas culpabiliser l'utilisateur »).
//
// Sur le web : no-op silencieux.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { pagesLabel } from './labels';
import { splitPagesAcrossSlots, splitPagesCustom } from './planner';
import { addDays, cycleDayDates, formatTime, slotsForWeekday, toDateKey, weekdayOf } from './schedule';
import { buildLearningSlot } from './learning';
import type { Cycle, DayState, PlannedSlot, Program } from './types';

/** Jours planifiés à l'avance (re-planifié à chaque ouverture). */
const HORIZON_DAYS = 3;
/** Plage d'identifiants réservée à la récitation. */
const ID_BASE = 730000;
const ID_SPAN = 10000;

type Kind = 0 | 1 | 2; // 0 = début, 1 = avant la fin, 2 = relance après la fin

/** Identifiant déterministe : permet d'annuler un rappel précis plus tard. */
function notifId(dayOffset: number, slotIndex: number, kind: Kind): number {
  return ID_BASE + dayOffset * 300 + slotIndex * 10 + kind;
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

/**
 * Annule les rappels d'un créneau du jour dont l'objectif est atteint : le
 * rappel « il reste N minutes » et la relance « séance non terminée » n'ont
 * plus lieu d'être.
 */
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
  // La sourate en cours a sa séance dédiée, y compris les jours suivants.
  const learning = buildLearningSlot(program.learning, program.schedule, program.createdAt, dateKey);
  return learning ? [...cycleSlots, learning].sort((a, b) => a.startMin - b.startMin) : cycleSlots;
}

/**
 * (Re)programme toutes les notifications des prochains jours actifs.
 * Idempotent : on purge d'abord la plage d'identifiants réservée.
 */
export async function scheduleRecitationNotifications(
  program: Program,
  cycle: Cycle,
  now: Date,
  dayState: DayState | null = null
): Promise<void> {
  if (!isNative()) return;
  await cancelRecitationNotifications();
  if (!program.schedule.remindersEnabled) return;
  if (!(await ensureNotificationPermission())) return;

  const dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const todayKey = toDateKey(now);
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];
  const at = (dateKey: string, minutes: number) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
  };

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const dateKey = addDays(todayKey, offset);
    if (!dayDates.includes(dateKey)) continue;
    const slots = plannedSlotsFor(program, cycle, dayDates, dateKey, dayState);

    slots.forEach((slot, i) => {
      if (!slot.pages.length) return;
      const isLearning = slot.kind === 'learning';
      const recited = new Set(
        offset === 0
          ? (isLearning ? (dayState?.learningRecited ?? []) : (dayState?.recitedPages ?? []))
          : []
      );
      const remaining = slot.pages.filter((p) => !recited.has(p));
      if (!remaining.length) return; // créneau déjà accompli : aucun rappel
      const surah = isLearning ? program.learning?.surah : undefined;
      const label = pagesLabel(slot.pages, surah);
      const count = remaining.length;

      // 1. Ouverture du créneau.
      const start = at(dateKey, slot.startMin);
      if (start > now) {
        notifications.push({
          id: notifId(offset, i, 0),
          title: isLearning ? 'Votre sourate en cours' : 'C’est l’heure de votre récitation',
          body: `${label} — jusqu’à ${formatTime(slot.endMin)}. Qu’Allah vous facilite.`,
          schedule: { at: start },
          extra: { route: '/recitation/en-cours' },
        });
      }

      // 2. Rappel avant la fin.
      if (program.endReminderMin != null) {
        const remindMin = slot.endMin - program.endReminderMin;
        const remindAt = at(dateKey, remindMin);
        if (remindAt > now && remindMin > slot.startMin) {
          notifications.push({
            id: notifId(offset, i, 1),
            title: `Il reste ${program.endReminderMin} minutes`,
            body: `${count} page${count > 1 ? 's' : ''} à réciter avant ${formatTime(slot.endMin)} (${label}).`,
            schedule: { at: remindAt },
            extra: { route: '/recitation/en-cours' },
          });
        }
      }

      // 3. Relance après la fin — annulée si la séance est accomplie.
      const followUpMin = slot.endMin + (program.endReminderMin ?? 15);
      if (followUpMin < 24 * 60) {
        const followUpAt = at(dateKey, followUpMin);
        if (followUpAt > now) {
          notifications.push({
            id: notifId(offset, i, 2),
            title: 'Séance non terminée',
            body: `${label} — vous pouvez reprendre maintenant.`,
            schedule: { at: followUpAt },
            extra: { route: '/recitation/en-cours' },
          });
        }
      }
    });
  }

  if (notifications.length) {
    try {
      await LocalNotifications.schedule({ notifications });
    } catch {
      /* silencieux */
    }
  }
}
