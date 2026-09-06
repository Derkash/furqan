'use client';

// Récitation improvisée : « il est 9 h, j'ai le temps, je récite 6 pages
// de mon juz' maintenant ». On coche ce qui a été récité — quel que soit le
// créneau auquel ces pages appartenaient — puis le reste de la journée est
// RÉ-ÉTALÉ équitablement sur les créneaux restants.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useRecitation } from '@/hooks/useRecitation';
import { rebalanceToday, setPagesRecited } from '@/lib/recitation/dayEngine';
import { pageRefLabel, pagesLabel } from '@/lib/recitation/labels';
import { refreshRecitationNative } from '@/lib/recitation/appSync';
import { formatTime } from '@/lib/recitation/schedule';
import type { SlotKind } from '@/lib/recitation/types';

export default function ImprovisationPage() {
  const router = useRouter();
  const { ctx, ready, now, refresh } = useRecitation();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedLearning, setSelectedLearning] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const dayState = ctx?.dayState ?? null;
  const learningSurah = ctx?.program.learning?.surah;

  // Pages du jour non encore récitées, par nature de séance.
  const { cyclePages, learningPages } = useMemo(() => {
    if (!dayState) return { cyclePages: [] as number[], learningPages: [] as number[] };
    const cycleRecited = new Set(dayState.recitedPages);
    const learnRecited = new Set(dayState.learningRecited ?? []);
    const cyclePages = [
      ...new Set(
        dayState.slots
          .filter((s) => (s.kind ?? 'cycle') === 'cycle')
          .flatMap((s) => s.pages)
          .filter((p) => !cycleRecited.has(p))
      ),
    ].sort((a, b) => a - b);
    const learningPages = [
      ...new Set(
        dayState.slots
          .filter((s) => s.kind === 'learning')
          .flatMap((s) => s.pages)
          .filter((p) => !learnRecited.has(p))
      ),
    ].sort((a, b) => a - b);
    return { cyclePages, learningPages };
  }, [dayState]);

  if (!ready) return <AppShell><div /></AppShell>;
  if (!ctx || !dayState) {
    return (
      <AppShell>
        <h1 className="ds-title text-2xl">Récitation improvisée</h1>
        <p className="text-[var(--ds-n600)] mt-2">Aucune journée de récitation en cours.</p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">Mon programme</Link>
      </AppShell>
    );
  }

  const toggle = (set: Set<number>, page: number, apply: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    apply(next);
  };

  /** Coche d'un geste toutes les pages jusqu'à celle-ci (récitation continue). */
  const selectThrough = (pages: number[], page: number, apply: (s: Set<number>) => void) => {
    apply(new Set(pages.filter((p) => p <= page)));
  };

  const total = selected.size + selectedLearning.size;

  const save = () => {
    if (!total || saving) return;
    setSaving(true);
    let state = dayState;
    if (selected.size) state = setPagesRecited(state, [...selected], 'cycle' as SlotKind);
    if (selectedLearning.size) state = setPagesRecited(state, [...selectedLearning], 'learning');
    // Le ré-étalement : la suite de la journée absorbe ce qui vient d'être fait.
    const nowMin = now.getHours() * 60 + now.getMinutes();
    rebalanceToday(state, nowMin);
    refreshRecitationNative(new Date());
    refresh();
    router.push('/recitation');
  };

  const remainingAfter = cyclePages.length - selected.size;
  const openSlots = dayState.slots.filter(
    (s, i) =>
      (s.kind ?? 'cycle') === 'cycle' &&
      s.endMin > now.getHours() * 60 + now.getMinutes() &&
      !dayState.closedSlots.includes(i)
  );

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-4">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)]">←</Link>
        <div className="min-w-0">
          <p className="ds-kicker">J’ai récité en avance</p>
          <h1 className="ds-title text-2xl md:text-3xl">Récitation improvisée</h1>
        </div>
      </header>

      <div className="max-w-[640px] flex flex-col gap-4 pb-28">
        <p className="text-[14px] text-[var(--ds-n600)] leading-relaxed">
          Cochez ce que vous venez de réciter — un appui long sélectionne tout jusqu’à cette
          page. Le reste de la journée sera ré-étalé sur vos créneaux restants.
        </p>

        {cyclePages.length > 0 && (
          <section className="ds-card p-4">
            <p className="text-sm font-extrabold mb-2.5">Révision du jour</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {cyclePages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(selected, p, setSelected)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    selectThrough(cyclePages, p, setSelected);
                  }}
                  className={`rounded-xl px-2 py-2.5 text-[13px] font-bold transition-colors ${
                    selected.has(p)
                      ? 'bg-[var(--ds-gold)] text-white'
                      : 'border border-[var(--ds-divider)] text-[var(--ds-n700)]'
                  }`}
                >
                  {pageRefLabel(p)}
                </button>
              ))}
            </div>
            {cyclePages.length > 1 && (
              <div className="flex gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(cyclePages))}
                  className="ds-btn-ghost px-3.5 py-1.5 text-[12px]"
                >
                  Tout
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ds-btn-ghost px-3.5 py-1.5 text-[12px]"
                >
                  Rien
                </button>
              </div>
            )}
          </section>
        )}

        {learningPages.length > 0 && (
          <section className="ds-card p-4">
            <p className="text-sm font-extrabold mb-2.5">Sourate en cours</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {learningPages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(selectedLearning, p, setSelectedLearning)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    selectThrough(learningPages, p, setSelectedLearning);
                  }}
                  className={`rounded-xl px-2 py-2.5 text-[13px] font-bold transition-colors ${
                    selectedLearning.has(p)
                      ? 'bg-[var(--ds-gold)] text-white'
                      : 'border border-[var(--ds-divider)] text-[var(--ds-n700)]'
                  }`}
                >
                  {pageRefLabel(p, learningSurah)}
                </button>
              ))}
            </div>
          </section>
        )}

        {cyclePages.length === 0 && learningPages.length === 0 && (
          <section className="ds-card p-5 text-center">
            <p className="text-[15px] font-extrabold text-[var(--ds-green)]">
              Tout est déjà récité — qu’Allah accepte.
            </p>
          </section>
        )}

        {/* Aperçu du ré-étalement */}
        {selected.size > 0 && (
          <section className="rounded-[20px] bg-[var(--ds-gold-100)] border border-[var(--ds-gold)] p-4">
            <p className="text-[13px] font-extrabold text-[var(--ds-gold-700)]">
              Après validation : {remainingAfter} page{remainingAfter > 1 ? 's' : ''} de révision
              {remainingAfter > 0 && openSlots.length > 0
                ? ` ré-étalée${remainingAfter > 1 ? 's' : ''} sur ${openSlots.length} créneau${openSlots.length > 1 ? 'x' : ''} (${openSlots
                    .map((s) => formatTime(s.startMin))
                    .join(', ')})`
                : remainingAfter === 0
                  ? ' — journée de révision terminée !'
                  : ''}
            </p>
          </section>
        )}
      </div>

      {/* Barre de validation fixe */}
      {total > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-[var(--ds-divider)] z-40">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ds-btn-gold w-full max-w-[640px] mx-auto block px-6 py-3.5 text-[15px] disabled:opacity-50"
          >
            Valider {total} page{total > 1 ? 's' : ''} récitée{total > 1 ? 's' : ''}
            {selected.size > 0 && ` (${pagesLabel([...selected].sort((a, b) => a - b))})`}
          </button>
        </div>
      )}
    </AppShell>
  );
}
