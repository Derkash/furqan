'use client';

// Quiz audio quotidien : on ÉCOUTE un verset tiré de tout le périmètre
// mémorisé, on répond (à voix haute, de tête — comme on veut), on révèle la
// double page avec le verset surligné, puis on déclare « Trouvé » ou
// « Pas trouvé ». La sélection maximise la couverture du périmètre et
// réserve 1-2 questions aux fautes récentes (lib/recitation/quiz.ts).

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import MushafDoublePage from '@/components/MushafDoublePage';
import { useAudio } from '@/hooks/useAudio';
import { useOrientation } from '@/hooks/useOrientation';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { refreshRecitationNative } from '@/lib/recitation/appSync';
import { pageRefLabel } from '@/lib/recitation/labels';
import {
  DEFAULT_QUIZ_SETTINGS,
  coverageStats,
  loadCoverage,
  loadQuizResults,
  recordQuizAnswer,
  selectQuizPages,
  type QuizSettings,
} from '@/lib/recitation/quiz';
import { formatTime, parseTime, toDateKey } from '@/lib/recitation/schedule';
import { loadProgram, saveProgram } from '@/lib/recitation/store';
import { getPagePair } from '@/utils/quranData';
import type { PageVerses, VersePosition } from '@/types';
import type { Program } from '@/lib/recitation/types';

type Phase = 'intro' | 'loading' | 'listening' | 'reveal' | 'done';

interface Question {
  page: number;
  verse: VersePosition;
}

const COUNTS: (5 | 10 | 15 | 20)[] = [5, 10, 15, 20];

function minToInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export default function QuizPage() {
  const orientation = useOrientation();
  const audio = useAudio();
  const [program, setProgram] = useState<Program | null>(null);
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS);
  const [firstRun, setFirstRun] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<{ q: Question; found: boolean }[]>([]);
  const [pair, setPair] = useState<{ left: PageVerses | null; right: PageVerses | null } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
     
    const p = loadProgram();
    setProgram(p);
    if (p?.quiz) setSettings(p.quiz);
    else setFirstRun(true); // premier lancement : on propose 5/10/15/20
  }, []);

  const perimeter = useMemo(() => program?.perimeterPages ?? [], [program]);
  const stats = useMemo(() => coverageStats(perimeter, loadCoverage()), [perimeter]);

  const persistSettings = (next: QuizSettings) => {
    setSettings(next);
    if (program) {
      const updated: Program = { ...program, quiz: next, updatedAt: new Date().toISOString() };
      setProgram(updated);
      saveProgram(updated);
      refreshRecitationNative(new Date()); // replanifie la notification
    }
  };

  // ---------------------------------------------------------------------
  // Déroulé
  // ---------------------------------------------------------------------

  const start = useCallback(async () => {
    if (!perimeter.length || startedRef.current) return;
    startedRef.current = true;
    setPhase('loading');
    const pages = selectQuizPages(
      perimeter,
      settings.questionCount,
      loadCoverage(),
      loadQuizResults(),
      toDateKey(new Date())
    );
    // Un verset aléatoire par page — le texte vient du layout local du mushaf.
    const qs: Question[] = [];
    for (const page of pages) {
      try {
        const pv = await fetchPageVerses(page);
        if (pv.verses.length) {
          qs.push({ page, verse: pv.verses[Math.floor(Math.random() * pv.verses.length)] });
        }
      } catch {
        /* page illisible : sautée */
      }
    }
    if (!qs.length) {
      startedRef.current = false;
      setPhase('intro');
      return;
    }
    setQuestions(qs);
    setAnswers([]);
    setIndex(0);
    setPhase('listening');
  }, [perimeter, settings.questionCount]);

  const current = questions[index] ?? null;

  // Jouer l'audio à l'arrivée de chaque question.
  useEffect(() => {
    if (phase === 'listening' && current) {
      audio.play(current.verse).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const reveal = useCallback(async () => {
    if (!current) return;
    audio.stop();
    const pagePair = getPagePair(current.page);
    const [right, left] = await Promise.all([
      fetchPageVerses(pagePair.rightPage).catch(() => null),
      pagePair.leftPage !== pagePair.rightPage ? fetchPageVerses(pagePair.leftPage).catch(() => null) : null,
    ]);
    setPair({ left, right });
    setPhase('reveal');
  }, [current, audio]);

  const answer = useCallback(
    (found: boolean) => {
      if (!current) return;
      recordQuizAnswer(current.page, current.verse.verseKey, found, new Date());
      const nextAnswers = [...answers, { q: current, found }];
      setAnswers(nextAnswers);
      setPair(null);
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        setPhase('listening');
      } else {
        setPhase('done');
        startedRef.current = false;
      }
    },
    [current, answers, index, questions.length]
  );

  // ---------------------------------------------------------------------
  // Rendus
  // ---------------------------------------------------------------------

  if (!program || !perimeter.length) {
    return (
      <AppShell>
        <h1 className="ds-title text-3xl">Quiz audio</h1>
        <p className="text-[var(--ds-n600)] mt-2">
          Le quiz interroge votre périmètre mémorisé — créez d’abord votre programme de récitation.
        </p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">Mon programme</Link>
      </AppShell>
    );
  }

  // ---- Révélation : double page, verset surligné ----
  if (phase === 'reveal' && current && pair) {
    const pagePair = getPagePair(current.page);
    const allVisible = new Set<string>([
      ...(pair.right?.verses.map((v) => v.verseKey) ?? []),
      ...(pair.left?.verses.map((v) => v.verseKey) ?? []),
    ]);
    return (
      <div className="h-dvh flex flex-col ds-page">
        <div className="flex items-center justify-between px-4 py-2 app-topbar-safe">
          <p className="text-sm font-extrabold text-[var(--ds-green)]">
            Question {index + 1} / {questions.length}
          </p>
          <p className="text-sm font-bold text-[var(--ds-gold-700)]">
            {pageRefLabel(current.page)} · verset {current.verse.verse}
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <MushafDoublePage
            leftPageVerses={pair.left}
            rightPageVerses={pair.right}
            pagePair={pagePair}
            orientation={orientation}
            revealedVerses={allVisible}
            visibleVerses={allVisible}
            highlightedVerseKey={current.verse.verseKey}
            onTap={() => {}}
          />
        </div>
        <div className="flex gap-2.5 p-4 pb-6">
          <button
            type="button"
            onClick={() => answer(true)}
            className="flex-1 rounded-full py-3.5 text-[15px] font-bold text-white"
            style={{ background: 'var(--ds-green)' }}
          >
            Trouvé ✓
          </button>
          <button
            type="button"
            onClick={() => answer(false)}
            className="flex-1 rounded-full py-3.5 text-[15px] font-bold text-white bg-[#b3542e]"
          >
            Pas trouvé
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <div>
          <p className="ds-kicker">Sur tout ce que vous connaissez</p>
          <h1 className="ds-title text-2xl md:text-3xl">Quiz audio</h1>
        </div>
      </header>

      <div className="max-w-[640px] flex flex-col gap-4 pb-10">
        {/* ---- Intro / réglages ---- */}
        {(phase === 'intro' || phase === 'loading') && (
          <>
            <section className="rounded-[20px] p-5 text-white" style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}>
              <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>Votre périmètre</p>
              <p className="text-2xl font-extrabold mt-0.5">{perimeter.length} pages mémorisées</p>
              <p className="text-sm text-white/85 mt-1">
                {stats.seen} déjà interrogée{stats.seen > 1 ? 's' : ''} — le quiz privilégie ce que
                vous n’avez pas encore vu, plus 1 à 2 questions sur vos fautes récentes.
              </p>
            </section>

            {firstRun ? (
              <section className="ds-card p-5">
                <p className="text-sm font-extrabold mb-2.5">Combien de questions par quiz ?</p>
                <div className="grid grid-cols-4 gap-2">
                  {COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => persistSettings({ ...settings, questionCount: n })}
                      className={`rounded-xl py-3 text-lg font-extrabold transition-colors ${
                        settings.questionCount === n
                          ? 'bg-[var(--ds-gold)] text-white'
                          : 'border border-[var(--ds-divider)] text-[var(--ds-n700)]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-[var(--ds-n500)] mt-2">
                  Modifiable à tout moment dans les réglages. Rappel quotidien à {formatTime(settings.hourMin)}.
                </p>
              </section>
            ) : (
              <section className="ds-card p-4">
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-sm font-extrabold">
                    {settings.questionCount} questions · rappel à {formatTime(settings.hourMin)}
                    {!settings.enabled && ' · désactivé'}
                  </span>
                  <span className="text-[var(--ds-n400)]">{showSettings ? '▴' : '▾'}</span>
                </button>
                {showSettings && (
                  <div className="mt-3 pt-3 border-t border-[var(--ds-divider)] flex flex-col gap-3">
                    <div className="grid grid-cols-4 gap-2">
                      {COUNTS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => persistSettings({ ...settings, questionCount: n })}
                          className={`rounded-xl py-2.5 text-base font-extrabold transition-colors ${
                            settings.questionCount === n
                              ? 'bg-[var(--ds-gold)] text-white'
                              : 'border border-[var(--ds-divider)] text-[var(--ds-n700)]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--ds-n600)] font-semibold">Rappel quotidien à</span>
                      <input
                        type="time"
                        value={minToInput(settings.hourMin)}
                        onChange={(e) => {
                          const v = parseTime(e.target.value);
                          if (v != null) persistSettings({ ...settings, hourMin: v });
                        }}
                        className="rounded-xl border border-[var(--ds-divider)] px-3 py-1.5 bg-white"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-semibold">Quiz quotidien activé</span>
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => persistSettings({ ...settings, enabled: e.target.checked })}
                        className="w-5 h-5 accent-[var(--ds-gold)]"
                      />
                    </label>
                  </div>
                )}
              </section>
            )}

            <button
              type="button"
              onClick={() => {
                if (firstRun) {
                  persistSettings(settings); // fige le choix du premier lancement
                  setFirstRun(false);
                }
                start();
              }}
              disabled={phase === 'loading'}
              className="ds-btn-gold px-7 py-3.5 text-[15px] disabled:opacity-50"
            >
              {phase === 'loading' ? 'Préparation…' : `Commencer — ${settings.questionCount} questions`}
            </button>
          </>
        )}

        {/* ---- Écoute ---- */}
        {phase === 'listening' && current && (
          <>
            <section className="ds-card p-6 text-center">
              <p className="ds-kicker">Question {index + 1} / {questions.length}</p>
              <p className="text-xl font-extrabold mt-3">Où se trouve ce verset ?</p>
              <p className="text-sm text-[var(--ds-n600)] mt-1.5">
                Écoutez, puis situez-le — sourate, page, contexte… comme vous voulez.
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => current && audio.play(current.verse).catch(() => {})}
                  className="ds-btn-ghost px-5 py-2.5 text-sm"
                >
                  {audio.isPlaying ? '🔊 En lecture…' : 'Réécouter'}
                </button>
              </div>
            </section>
            <button type="button" onClick={reveal} className="ds-btn-gold px-7 py-3.5 text-[15px]">
              J’ai répondu — révéler
            </button>
            <p className="text-[12px] text-[var(--ds-n500)] text-center">
              La réponse affichera la double page, verset surligné.
            </p>
          </>
        )}

        {/* ---- Bilan ---- */}
        {phase === 'done' && (
          <>
            <section className="rounded-[20px] p-5 text-white" style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}>
              <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>Quiz terminé</p>
              <p className="text-3xl font-extrabold mt-0.5">
                {answers.filter((a) => a.found).length} / {answers.length}
              </p>
              <p className="text-sm text-white/85 mt-1">
                {answers.filter((a) => !a.found).length
                  ? 'Les versets manqués reviendront dans vos prochains quiz.'
                  : 'Sans faute — qu’Allah affermisse votre mémorisation.'}
              </p>
            </section>
            {answers.some((a) => !a.found) && (
              <section className="ds-card p-4">
                <p className="text-sm font-extrabold mb-2">À revoir</p>
                <div className="flex flex-col divide-y divide-[var(--ds-divider)]">
                  {answers.filter((a) => !a.found).map((a, i) => (
                    <p key={i} className="py-2 text-sm font-semibold">
                      {pageRefLabel(a.q.page)} · verset {a.q.verse.surah}:{a.q.verse.verse}
                    </p>
                  ))}
                </div>
              </section>
            )}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPhase('intro');
                }}
                className="ds-btn-gold px-6 py-3 text-sm"
              >
                Refaire un quiz
              </button>
              <Link href="/recitation" className="ds-btn-ghost px-6 py-3 text-sm">
                Mon programme
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
