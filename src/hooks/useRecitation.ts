'use client';

// Hook central de la récitation : charge le contexte du jour (ensureToday),
// fait vivre les créneaux (tick chaque minute), expose les actions et pousse
// chaque changement vers le widget / l'écran verrouillé (syncNative).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cycleProgress,
  ensureToday,
  resolveCarryOver,
  resolveMissedDays,
  setPageRecited,
  clearPendingEvaluation,
  tick,
  type TodayContext,
} from '@/lib/recitation/dayEngine';
import { appendEvaluation } from '@/lib/recitation/store';
import { cancelSlotFollowUps, scheduleRecitationNotifications } from '@/lib/recitation/notifications';
import { syncNative } from '@/lib/recitation/widgetSync';
import type { DayState, MasteryLevel, SlotKind } from '@/lib/recitation/types';

export interface RecitationApi {
  ctx: TodayContext | null;
  /** false tant que le premier ensureToday n'a pas tourné (SSR/hydratation). */
  ready: boolean;
  now: Date;
  cycleStats: { recited: number; total: number } | null;
  markRecited: (page: number, recited: boolean, kind?: SlotKind) => void;
  evaluate: (page: number, level: MasteryLevel, note?: string) => void;
  skipEvaluation: (page: number) => void;
  decideCarryOver: (accept: boolean) => void;
  decideMissed: (mode: 'catch-up' | 'skip') => void;
  refresh: () => void;
}

export function useRecitation(): RecitationApi {
  const [ctx, setCtx] = useState<TodayContext | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const notifiedRef = useRef(false);

  const refresh = useCallback(() => {
    const current = new Date();
    setNow(current);
    let next = ensureToday(current);
    if (next?.dayState) {
      const ticked = tick(next.program, next.dayState, current);
      if (ticked !== next.dayState) next = { ...next, dayState: ticked };
    }
    setCtx(next);
    setReady(true);
    syncNative(next, current);
    // (Re)planifie les notifications une fois par montage.
    if (next && !notifiedRef.current) {
      notifiedRef.current = true;
      scheduleRecitationNotifications(next.program, next.cycle, current, next.dayState).catch(() => {});
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const withState = useCallback(
    (fn: (state: DayState) => DayState) => {
      setCtx((prev) => {
        if (!prev?.dayState) return prev;
        const nextState = fn(prev.dayState);
        const next = { ...prev, dayState: nextState };
        syncNative(next, new Date());
        // Séance accomplie → on retire ses relances : ne jamais annoncer une
        // « séance non terminée » à quelqu'un qui vient de tout réciter.
        nextState.slots.forEach((slot, i) => {
          const recited = new Set(
            slot.kind === 'learning' ? (nextState.learningRecited ?? []) : nextState.recitedPages
          );
          if (slot.pages.length && slot.pages.every((p) => recited.has(p))) {
            cancelSlotFollowUps(i).catch(() => {});
          }
        });
        return next;
      });
    },
    []
  );

  const markRecited = useCallback(
    (page: number, recited: boolean, kind: SlotKind = 'cycle') =>
      withState((s) => setPageRecited(s, page, recited, kind)),
    [withState]
  );

  const evaluate = useCallback(
    (page: number, level: MasteryLevel, note?: string) => {
      appendEvaluation({ page, level, note: note || undefined, at: new Date().toISOString() });
      withState((s) => clearPendingEvaluation(s, page));
    },
    [withState]
  );

  const skipEvaluation = useCallback(
    (page: number) => withState((s) => clearPendingEvaluation(s, page)),
    [withState]
  );

  const decideCarryOver = useCallback(
    (accept: boolean) => withState((s) => resolveCarryOver(s, accept)),
    [withState]
  );

  const decideMissed = useCallback(
    (mode: 'catch-up' | 'skip') => {
      setCtx((prev) => {
        if (!prev?.dayState) return prev;
        const nextState = resolveMissedDays(prev.program, prev.cycle, prev.dayState, prev.missedDates, mode);
        return { ...prev, dayState: nextState, missedDates: [] };
      });
    },
    []
  );

  const cycleStats = ctx ? cycleProgress(ctx.cycle, ctx.dayState) : null;

  return {
    ctx,
    ready,
    now,
    cycleStats,
    markRecited,
    evaluate,
    skipEvaluation,
    decideCarryOver,
    decideMissed,
    refresh,
  };
}
