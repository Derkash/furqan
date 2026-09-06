// Synchronisation de la récitation au niveau de l'APPLICATION.
//
// Le widget, l'activité en direct et les notifications ne peuvent être
// alimentés que par du code qui s'exécute. Les rattacher aux écrans
// /recitation/* était une erreur : ouvrir l'app sur l'accueil (ou revenir
// d'un widget) ne déclenchait alors AUCUNE synchronisation — d'où l'activité
// en direct absente et les notifications jamais programmées.
//
// Ce module est appelé par AppInit : au démarrage, à chaque retour au
// premier plan, et périodiquement tant que l'app est ouverte.

import { ensureToday, tick, type TodayContext } from './dayEngine';
import { scheduleRecitationNotifications } from './notifications';
import { syncNative } from './widgetSync';

/** Empêche de reprogrammer les notifications à chaque tick (coûteux). */
let lastScheduleKey = '';
let lastScheduleAt = 0;
const RESCHEDULE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Met la journée à jour puis pousse tout ce qui vit hors de l'écran :
 * état du widget, activité en direct, notifications. Renvoie le contexte.
 */
export function refreshRecitationNative(now: Date = new Date()): TodayContext | null {
  let ctx = ensureToday(now);
  if (ctx?.dayState) {
    const ticked = tick(ctx.program, ctx.dayState, now);
    if (ticked !== ctx.dayState) ctx = { ...ctx, dayState: ticked };
  }

  syncNative(ctx, now);

  if (ctx) {
    // Signature de ce qui influence les notifications : le jour, les créneaux
    // et l'avancement. On reprogramme quand elle change, ou au plus toutes
    // les 10 minutes — reprogrammer purge et réinstalle toute la plage.
    const key = [
      ctx.todayKey,
      ctx.dayState?.slots.map((s) => `${s.startMin}-${s.endMin}:${s.pages.join('.')}`).join('|') ?? '',
      ctx.dayState?.recitedPages.join('.') ?? '',
    ].join('#');
    const stale = now.getTime() - lastScheduleAt > RESCHEDULE_INTERVAL_MS;
    if (key !== lastScheduleKey || stale) {
      lastScheduleKey = key;
      lastScheduleAt = now.getTime();
      scheduleRecitationNotifications(ctx.program, ctx.cycle, now, ctx.dayState).catch(() => {});
    }
  }

  return ctx;
}
