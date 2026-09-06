'use client';

// « Récitation en cours » (brief §6-7, maquette 1) : créneau courant, compte à
// rebours, parcours page par page, carte « Votre passage » (début/fin exacts en
// glyphes QCF), évaluation de maîtrise après chaque page.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import EvaluationSheet from '@/components/recitation/EvaluationSheet';
import VersePassage from '@/components/recitation/VersePassage';
import { useRecitation } from '@/hooks/useRecitation';
import { pageRefLabel, pagesLabel, surahSpanLabel, surahsOfPage } from '@/lib/recitation/labels';
import { MASTERY_LABELS, reinforcementReason } from '@/lib/recitation/mastery';
import { currentSlot, formatTime, nextSlot } from '@/lib/recitation/schedule';
import { evaluationsByPage, loadEvaluations } from '@/lib/recitation/store';

/** Compte à rebours mm:ss jusqu'à endMin (minutes depuis minuit). */
function Countdown({ endMin }: { endMin: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const nowDate = new Date();
  const end = new Date(nowDate);
  end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  const totalSec = Math.max(0, Math.floor((end.getTime() - nowDate.getTime()) / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return (
    <span className="tabular-nums font-extrabold">
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

export default function EnCoursPage() {
  const { ctx, ready, now, markRecited, evaluate, skipEvaluation } = useRecitation();
  const [toEvaluate, setToEvaluate] = useState<number | null>(null);
  const parcoursRef = useRef<HTMLDivElement>(null);

  const dayState = ctx?.dayState ?? null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const active = dayState ? currentSlot(dayState.slots, nowMin) : null;
  const upcoming = dayState ? nextSlot(dayState.slots, nowMin) : null;
  const slot = useMemo(() => {
    if (!dayState) return null;
    const ref = active ?? upcoming;
    if (!ref) return dayState.slots[dayState.slots.length - 1] ?? null;
    return dayState.slots.find((s) => s.startMin === ref.startMin) ?? null;
  }, [dayState, active, upcoming]);

  // La séance de la sourate en cours a son PROPRE suivi : réciter une page en
  // révision ne la valide pas ici, et inversement.
  const isLearning = slot?.kind === 'learning';
  const learningSurah = isLearning ? ctx?.program.learning?.surah : undefined;
  const recitedSet = new Set(
    (isLearning ? dayState?.learningRecited : dayState?.recitedPages) ?? []
  );
  const pages = slot?.pages ?? [];
  const done = pages.filter((p) => recitedSet.has(p)).length;
  const nextPage = pages.find((p) => !recitedSet.has(p)) ?? null;
  const reinforcementSet = new Set(dayState?.reinforcementPages ?? []);
  const evalsByPage = useMemo(() => evaluationsByPage(loadEvaluations()), []);

  if (!ready) return <AppShell><div /></AppShell>;
  if (!ctx || !dayState || !slot) {
    return (
      <AppShell>
        <div className="max-w-[560px]">
          <h1 className="ds-title text-3xl">Récitation en cours</h1>
          <p className="text-[var(--ds-n600)] mt-2">
            {!ctx
              ? 'Aucun programme de récitation pour le moment.'
              : 'Aucun créneau prévu aujourd’hui — jour de repos.'}
          </p>
          <Link href={ctx ? '/recitation' : '/recitation/perimetre'} className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">
            {ctx ? 'Voir mon programme' : 'Créer mon programme'}
          </Link>
        </div>
      </AppShell>
    );
  }

  const markAndEvaluate = (page: number) => {
    markRecited(page, true, slot.kind);
    setToEvaluate(page);
  };

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">
          ←
        </Link>
        <div>
          <h1 className="ds-title text-3xl">
            {isLearning ? 'Sourate en cours' : 'Récitation en cours'}
          </h1>
          <p className="text-[var(--ds-n600)] mt-0.5">
            {isLearning && 'Consolidation quotidienne · '}
            {active
              ? `${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`
              : upcoming
                ? `Prochaine séance : ${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`
                : `Dernière séance de la journée (${formatTime(slot.startMin)} – ${formatTime(slot.endMin)})`}
          </p>
        </div>
      </header>

      <div className="max-w-[720px]">
        {/* Carte verte de synthèse (maquette 1) */}
        <section
          className="rounded-[24px] p-6 text-white mb-4"
          style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-bold tracking-[0.14em] text-white/85">
              {done} PAGE{done > 1 ? 'S' : ''} SUR {pages.length}
            </p>
            {active && (
              <p className="text-sm text-white/90 flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <Countdown endMin={slot.endMin} /> restantes
              </p>
            )}
          </div>

          {/* Frise des pages */}
          <div className="flex items-center mt-4 mb-1">
            {pages.map((p, i) => (
              <div key={p} className="flex items-center" style={{ flex: i < pages.length - 1 ? 1 : 'none' }}>
                <div className="flex flex-col items-center">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-extrabold border-2 ${
                      recitedSet.has(p)
                        ? 'bg-[var(--ds-gold)] border-[var(--ds-gold)] text-white'
                        : p === nextPage
                          ? 'bg-white border-[var(--ds-gold)] text-[var(--ds-gold-700)]'
                          : 'bg-white/15 border-white/25 text-white/80'
                    }`}
                  >
                    {recitedSet.has(p) ? '✓' : p}
                  </span>
                  <span className={`text-[10px] mt-1 whitespace-nowrap ${p === nextPage ? 'font-extrabold' : 'text-white/70'}`}>
                    {pageRefLabel(p, learningSurah)}
                  </span>
                </div>
                {i < pages.length - 1 && <div className="h-[2px] flex-1 mx-1 bg-white/25 rounded" />}
              </div>
            ))}
          </div>

          <p className="text-2xl md:text-3xl font-extrabold mt-3">{pagesLabel(pages, learningSurah)}</p>
          <p className="text-sm text-white/85">
            {surahSpanLabel(pages)}
            {isLearning && ' · depuis le début de la sourate'}
          </p>
        </section>

        {/* Parcours page par page */}
        <section className="ds-card p-5 md:p-6 mb-4" ref={parcoursRef}>
          <h2 className="text-lg font-extrabold mb-4">Votre parcours</h2>
          <div className="flex flex-col divide-y divide-[var(--ds-divider)]">
            {pages.map((p) => {
              const isDone = recitedSet.has(p);
              const isNext = p === nextPage;
              const lastEval = evalsByPage.get(p)?.slice(-1)[0];
              return (
                <div key={p} className="py-3 flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => (isDone ? markRecited(p, false, slot.kind) : markAndEvaluate(p))}
                    aria-label={isDone ? `Décocher la page ${p}` : `Marquer la page ${p} comme récitée`}
                    className={`flex-none w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold border-2 transition-colors ${
                      isDone
                        ? 'bg-[var(--ds-gold)] border-[var(--ds-gold)] text-white'
                        : isNext
                          ? 'border-[var(--ds-gold)] text-[var(--ds-gold-700)]'
                          : 'border-[var(--ds-divider)] text-[var(--ds-n500)]'
                    }`}
                  >
                    {isDone ? '✓' : p}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold">
                      {pageRefLabel(p, learningSurah)}
                      {reinforcementSet.has(p) && (
                        <span
                          className="ml-2 text-[10px] font-extrabold tracking-wider text-[var(--ds-gold-700)] bg-[var(--ds-gold-100)] rounded-full px-2 py-0.5 align-middle"
                          title={lastEval ? reinforcementReason(lastEval.level) : undefined}
                        >
                          RENFORCEMENT
                        </span>
                      )}
                    </p>
                    <p className={`text-[13px] ${isNext ? 'text-[var(--ds-gold-700)] font-bold' : 'text-[var(--ds-n500)]'}`}>
                      {isDone
                        ? lastEval && lastEval.at.slice(0, 10) === dayState.date
                          ? `Récitée · ${MASTERY_LABELS[lastEval.level]}`
                          : 'Récitée'
                        : isNext
                          ? 'À réciter maintenant'
                          : 'À suivre'}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--ds-n500)] flex-none hidden sm:block">
                    {surahsLabelShort(p)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Votre passage */}
        {pages.length > 0 && <VersePassage firstPage={pages[0]} lastPage={pages[pages.length - 1]} />}

        {/* Actions */}
        <div className="flex flex-col gap-2.5 mt-5 pb-10">
          {nextPage != null ? (
            <>
              <button
                type="button"
                onClick={() => markAndEvaluate(nextPage)}
                className="ds-btn-gold px-6 py-3.5 text-[15px]"
              >
                Marquer {pageRefLabel(nextPage, learningSurah)} comme récitée
              </button>
              {done > 0 && (
                <button
                  type="button"
                  onClick={() => parcoursRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="ds-btn-ghost px-6 py-3 text-sm"
                >
                  Reprendre à {pageRefLabel(nextPage, learningSurah)}
                </button>
              )}
            </>
          ) : (
            <div className="ds-card p-5 text-center">
              <p className="text-lg font-extrabold text-[var(--ds-green)]">
                Créneau terminé — qu’Allah accepte votre récitation.
              </p>
              {upcoming && (
                <p className="text-sm text-[var(--ds-n600)] mt-1">
                  Prochaine session à {formatTime(upcoming.startMin)}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {toEvaluate != null && (
        <EvaluationSheet
          page={toEvaluate}
          onEvaluate={(level, note) => {
            evaluate(toEvaluate, level, note);
            setToEvaluate(null);
          }}
          onSkip={() => {
            skipEvaluation(toEvaluate);
            setToEvaluate(null);
          }}
        />
      )}
    </AppShell>
  );
}

/** Petite étiquette de sourate pour une page. */
function surahsLabelShort(page: number): string {
  return surahsOfPage(page)
    .map((s) => s.nameSimple)
    .join(' · ');
}
