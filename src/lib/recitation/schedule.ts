// Jours et horaires : génère les créneaux d'une date selon la configuration
// (jours actifs, plage horaire, fréquence, horaires spécifiques par jour).
// Section 3 du brief. Pur : la date/l'heure sont passées en paramètre.

import type { DayHours, ScheduleConfig, Slot } from './types';

/** "08:30" → 510. Renvoie null si le format est invalide. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 510 → "8 h 30" ; 480 → "8 h" (format d'affichage français). */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Horaires effectifs d'un jour de semaine (override sinon défaut). */
export function hoursForWeekday(config: ScheduleConfig, weekday: number): DayHours {
  return config.overrides?.[weekday] ?? config.hours;
}

/** Le jour est-il actif ? (weekday = Date.getDay(), 0 = dimanche) */
export function isActiveWeekday(config: ScheduleConfig, weekday: number): boolean {
  return config.activeWeekdays.includes(weekday);
}

/**
 * Créneaux d'un jour actif. Fréquence n minutes → créneaux [début, début+n)
 * jusqu'à la fin de plage (dernier créneau tronqué s'il dépasse) ; fréquence
 * null → créneaux manuels tels quels, triés.
 */
export function slotsForWeekday(config: ScheduleConfig, weekday: number): Slot[] {
  if (!isActiveWeekday(config, weekday)) return [];
  const hours = hoursForWeekday(config, weekday);
  if (hours.frequencyMin == null) {
    return [...(hours.manualSlots ?? [])].sort((a, b) => a.startMin - b.startMin);
  }
  const freq = Math.max(15, hours.frequencyMin);
  const slots: Slot[] = [];
  for (let start = hours.startMin; start < hours.endMin; start += freq) {
    slots.push({ startMin: start, endMin: Math.min(start + freq, hours.endMin) });
  }
  return slots;
}

/** Créneau contenant l'instant donné (minutes depuis minuit), sinon null. */
export function currentSlot(slots: Slot[], nowMin: number): Slot | null {
  return slots.find((s) => nowMin >= s.startMin && nowMin < s.endMin) ?? null;
}

/** Prochain créneau strictement à venir aujourd'hui, sinon null. */
export function nextSlot(slots: Slot[], nowMin: number): Slot | null {
  return slots.find((s) => s.startMin > nowMin) ?? null;
}

/**
 * Prochain jour actif à partir de `from` (incluse si includeFrom).
 * Renvoie un décalage en jours (0-7) ou null si aucun jour n'est actif.
 */
export function nextActiveDayOffset(
  config: ScheduleConfig,
  fromWeekday: number,
  includeFrom: boolean
): number | null {
  if (!config.activeWeekdays.length) return null;
  for (let offset = includeFrom ? 0 : 1; offset <= 7; offset++) {
    if (isActiveWeekday(config, (fromWeekday + offset) % 7)) return offset;
  }
  return null;
}

/** Date locale → "YYYY-MM-DD" (sans passer par l'UTC d'ISO). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" + n jours → "YYYY-MM-DD" (calendrier local). */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + n, 12); // midi : à l'abri des DST
  return toDateKey(date);
}

/** Jour de semaine (0-6) d'une clé de date. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

/**
 * Dates des journées du cycle : chaque jour du cycle occupe le prochain jour
 * ACTIF du calendrier (les jours inactifs sont sautés). Renvoie une clé de
 * date par jour du cycle, à partir de startDate.
 */
export function cycleDayDates(config: ScheduleConfig, startDate: string, dayCount: number): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  let first = true;
  for (let i = 0; i < dayCount; i++) {
    const offset = nextActiveDayOffset(config, weekdayOf(cursor), first);
    if (offset == null) return dates; // aucun jour actif : cycle non planifiable
    cursor = addDays(cursor, offset);
    dates.push(cursor);
    first = false;
  }
  return dates;
}
