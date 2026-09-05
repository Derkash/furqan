// Notifications locales de récitation (brief §14) : annonce au début de chaque
// créneau + rappel avant la fin. Programmées à l'avance pour les prochains
// jours (re-planifiées à chaque ouverture / modification du programme).
// Sur le web : no-op silencieux. Un appui ouvre la page « Récitation en cours »
// (géré par l'écouteur d'AppInit via l'extra `route`).

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { addDays, cycleDayDates, formatTime, slotsForWeekday, toDateKey, weekdayOf } from './schedule';

import type { Cycle, Program } from './types';

/** Jours planifiés à l'avance (au-delà, re-planifié à la prochaine ouverture). */
const HORIZON_DAYS = 3;
/** Base des identifiants (réservée à la récitation, purgée à chaque re-planif). */
const ID_BASE = 730000;

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

/** Annule toutes les notifications de récitation programmées. */
export async function cancelRecitationNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 10000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch {
    /* silencieux */
  }
}

/**
 * (Re)programme les notifications des prochains jours actifs : début de
 * créneau (« Votre récitation de 18 h à 19 h est prête : pages 3 à 6 ») et
 * rappel avant la fin si configuré.
 */
export async function scheduleRecitationNotifications(
  program: Program,
  cycle: Cycle,
  now: Date
): Promise<void> {
  if (!isNative()) return;
  await cancelRecitationNotifications();
  if (!program.schedule.remindersEnabled) return;
  if (!(await ensureNotificationPermission())) return;

  const dayDates = cycleDayDates(program.schedule, cycle.startDate, cycle.days.length);
  const todayKey = toDateKey(now);
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];
  let id = ID_BASE;

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const dateKey = addDays(todayKey, offset);
    const dayIdx = dayDates.indexOf(dateKey);
    if (dayIdx === -1) continue;
    const pages = cycle.days[dayIdx]?.pages ?? [];
    const slots = slotsForWeekday(program.schedule, weekdayOf(dateKey));
    if (!slots.length || !pages.length) continue;
    // Répartition indicative (le renforcement du jour même peut décaler d'une
    // page ou deux — acceptable pour un texte de notification).
    const per = Math.ceil(pages.length / slots.length);
    const [y, m, d] = dateKey.split('-').map(Number);

    slots.forEach((slot, i) => {
      const slotPages = pages.slice(i * per, (i + 1) * per);
      if (!slotPages.length) return;
      const label =
        slotPages.length === 1
          ? `page ${slotPages[0]}`
          : `pages ${slotPages[0]} à ${slotPages[slotPages.length - 1]}`;
      const startAt = new Date(y, m - 1, d, Math.floor(slot.startMin / 60), slot.startMin % 60);
      if (startAt > now) {
        notifications.push({
          id: id++,
          title: 'Al Muraja3a',
          body: `Votre récitation de ${formatTime(slot.startMin)} à ${formatTime(slot.endMin)} est prête : ${label}.`,
          schedule: { at: startAt },
          extra: { route: '/recitation/en-cours' },
        });
      }
      if (program.endReminderMin != null) {
        const remindMin = slot.endMin - program.endReminderMin;
        const remindAt = new Date(y, m - 1, d, Math.floor(remindMin / 60), remindMin % 60);
        if (remindAt > now && remindMin > slot.startMin) {
          notifications.push({
            id: id++,
            title: 'Al Muraja3a',
            body: `Il vous reste ${program.endReminderMin} minutes sur le créneau de ${formatTime(slot.startMin)}.`,
            schedule: { at: remindAt },
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
