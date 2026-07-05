'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useExercise } from '@/hooks/exercises/useExercise';
import { useAudio } from '@/hooks/useAudio';
import { useTranslation } from '@/hooks/exercises/useTranslation';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import type { Orientation, VersePosition } from '@/types';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import MushafDoublePage from '@/components/MushafDoublePage';
import RecitationPractice from '@/components/exercises/RecitationPractice';
import type { ExerciseId, VersePositionType } from '@/types/exercises';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getCurrentUser,
  getMistakeWordMarks,
  recordVerseResult,
  type MistakeType,
} from '@/utils/exercises/userStats';
import Link from 'next/link';

export default function PracticePage() {
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  // La récitation (micro + détection de fautes) a sa propre interface,
  // sans les pages Mushaf ni la machine à états des autres exercices.
  if (exerciseId === 'recitation') {
    return <RecitationPractice />;
  }
  return <MushafPractice />;
}

function MushafPractice() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const exerciseId = params.exerciseId as string;

  const startPage = Number(searchParams.get('start')) || 3;
  const endPage = Number(searchParams.get('end')) || 10;
  const identifyParam = searchParams.get('identify');
  const revealParam = searchParams.get('reveal');
  const showParam = searchParams.get('show');
  const dirParam = searchParams.get('dir');
  const nParam = searchParams.get('n');

  const {
    state,
    currentStep,
    leftPageVerses,
    rightPageVerses,
    pagePair,
    isBlurred,
    maskAll,
    visibleVerses,
    singlePage,
    hifzLevel,
    setHifzLevel,
    displayedPage,
    loading,
    canFlipPrev,
    canFlipNext,
    flipPair,
    initialize,
    start,
    nextStep,
    reset,
  } = useExercise();

  // Double page côte à côte forcée pour tous les exercices (Hifz utilise singlePage et ignore l'orientation)
  const orientation: Orientation = 'landscape';
  const audio = useAudio();
  const [initialized, setInitialized] = useState(false);
  // Dernier verset joué à l'audio dans le tour courant : permet de le faire
  // répéter à tout moment (bouton dans le bandeau), à toutes les étapes.
  const [lastAudioVerse, setLastAudioVerse] = useState<VersePosition | null>(null);
  // Mode lecture plein écran (Hifz) : masque les barres du haut pour maximiser la lecture.
  const [readingMode, setReadingMode] = useState(false);
  const isHifz = exerciseId === 'hifz';
  const fullscreen = isHifz && readingMode;

  // Hifz : fautes déclarées en Récitation, transférées ici (une couleur par type).
  const [showMistakes, setShowMistakes] = useState(true);
  const [mistakeWords, setMistakeWords] = useState<Map<string, MistakeType>>(new Map());
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHifz) setMistakeWords(getMistakeWordMarks(getCurrentUser()));
  }, [isHifz]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Traduction Hamidullah (Hifz) : affichée seulement au tap sur un verset, en popover.
  const { translations, loading: translationLoading, load: loadTranslations } = useTranslation();
  const { data: quranUnits } = useQuranUnits();
  // popover = verset sélectionné + coordonnées du tap (clientX/clientY).
  const [popover, setPopover] = useState<{ verseKey: string; x: number; y: number } | null>(null);
  // Position finale (clampée à l'écran), calculée après mesure du popover.
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Tap sur un verset (délégation via data-verse) → popover au point cliqué ; tap hors verset → ferme.
  const handleMushafClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHifz) return;
    const el = (e.target as HTMLElement).closest('[data-verse]');
    const verseKey = el?.getAttribute('data-verse');
    if (verseKey) {
      loadTranslations();
      setPopoverPos(null);
      setPopover({ verseKey, x: e.clientX, y: e.clientY });
    } else {
      setPopover(null);
    }
  };

  // Place le popover près du point cliqué, en le gardant dans l'écran (clamp + flip vertical).
  useEffect(() => {
    if (!popover || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const offset = 14;
    let left = popover.x - rect.width / 2;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    let top = popover.y + offset;
    if (top + rect.height > vh - margin) {
      // Déborde en bas → place au-dessus du point cliqué.
      top = popover.y - offset - rect.height;
    }
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));
    setPopoverPos({ left, top });
  }, [popover, translations]);

  // Initialize exercise
  useEffect(() => {
    if (!isValidExerciseId(exerciseId) || initialized) return;

    const parsePositions = (s: string | null): VersePositionType[] =>
      (s ? s.split(',').filter(Boolean) : []) as VersePositionType[];

    initialize({
      exerciseId: exerciseId as ExerciseId,
      startPage,
      endPage,
      maxRounds: nParam ? Number(nParam) || undefined : undefined,
      identifyPosition: (identifyParam ?? undefined) as VersePositionType | undefined,
      revealAfter: parsePositions(revealParam),
      showPositions: parsePositions(showParam),
      direction: (dirParam ?? undefined) as 'forward' | 'backward' | undefined,
    }).then(() => {
      setInitialized(true);
    });
  }, [exerciseId, startPage, endPage, nParam, identifyParam, revealParam, showParam, dirParam, initialize, initialized]);

  // Auto-start when initialized
  useEffect(() => {
    if (initialized && state.status === 'idle') {
      start();
    }
  }, [initialized, state.status, start]);

  // Play audio when step is listening
  // Note: on utilise audio.play dans une ref pour éviter les boucles infinies
  const audioPlayRef = useRef(audio.play);
  useEffect(() => {
    audioPlayRef.current = audio.play;
  }, [audio.play]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentStep?.type === 'listening' && currentStep.targetVerse) {
      audioPlayRef.current(currentStep.targetVerse);
      setLastAudioVerse(currentStep.targetVerse);
    }
  }, [currentStep]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // « Avez-vous trouvé ? » : demandé en fin de tour pour les exercices de quiz,
  // et mémorisé pour orienter les prochaines interrogations vers les échecs.
  const [askFound, setAskFound] = useState(false);
  const asksFeedback = exerciseId === 'audio-quiz' || exerciseId === 'sequential';
  const roundTargets = useMemo(() => {
    const seen = new Map<string, number>();
    for (const step of state.currentRound?.steps ?? []) {
      if (step.targetVerse) seen.set(step.targetVerse.verseKey, step.targetVerse.page);
    }
    return Array.from(seen, ([verseKey, page]) => ({ verseKey, page }));
  }, [state.currentRound]);

  const answerFound = (found: boolean) => {
    const user = getCurrentUser();
    const at = new Date().toISOString();
    for (const t of roundTargets) {
      recordVerseResult(user, { verseKey: t.verseKey, page: t.page, found, exercise: exerciseId, at });
    }
    setAskFound(false);
    nextStep();
  };

  // Handle tap
  const handleTap = () => {
    // Arrêter l'audio en cours si il y en a
    audio.stop();

    if (state.status === 'completed') {
      router.push(`/exercises/${exerciseId}/setup`);
      return;
    }
    // En Hifz, on reste sur la page : pas d'avancement au tap
    if (exerciseId === 'hifz') return;
    if (askFound) return;

    // Dernière étape du tour d'un quiz → demander d'abord « trouvé ou pas ? »
    if (
      asksFeedback &&
      state.currentRound &&
      state.currentRound.currentStepIndex === state.currentRound.steps.length - 1 &&
      roundTargets.length > 0
    ) {
      setAskFound(true);
      return;
    }
    nextStep();
  };

  // Validate exercise ID
  if (!isValidExerciseId(exerciseId)) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">Exercice non trouvé</p>
          <Link href="/exercises" className="text-[#2d5016] underline">
            Retour aux exercices
          </Link>
        </div>
      </div>
    );
  }

  const exercise = getExerciseDefinition(exerciseId as ExerciseId);

  // Loading state
  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#2d5016] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a7c23]">Chargement...</p>
        </div>
      </div>
    );
  }

  // Completed state
  if (state.status === 'completed') {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016] text-center">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-2">Terminé !</h2>
          <p className="text-[#4a7c23] mb-4">
            Vous avez terminé {toArabicNumbers(state.progress.totalRounds)} question
            {state.progress.totalRounds > 1 ? 's' : ''}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                reset();
                setInitialized(false);
              }}
              className="px-4 py-2 bg-[#c9a959] hover:bg-[#b89848] text-white rounded-lg"
            >
              Recommencer
            </button>
            <Link
              href="/exercises"
              className="px-4 py-2 bg-[#2d5016] hover:bg-[#4a7c23] text-white rounded-lg"
            >
              Autres exercices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Header avec progression */}
      {!fullscreen && (
        <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
          <Link
            href={`/exercises/${exerciseId}/setup`}
            className="text-sm hover:underline"
          >
            ← Retour
          </Link>
          <span className="text-sm font-medium">
            {exerciseId === 'hifz' ? (
              <>
                Pages {toArabicNumbers(pagePair.rightPage)}–{toArabicNumbers(pagePair.leftPage)}
              </>
            ) : (
              <>
                Page {toArabicNumbers(state.progress.currentPage)} • Question{' '}
                {toArabicNumbers(state.progress.pagesCompleted + 1)}/
                {toArabicNumbers(state.progress.totalRounds)}
              </>
            )}
          </span>
          {isHifz ? (
            <button
              type="button"
              onClick={() => setReadingMode(true)}
              aria-label="Mode lecture plein écran"
              className="flex items-center gap-1 text-xs font-semibold text-[#c9a959] hover:text-[#fdfaf3] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
              Plein écran
            </button>
          ) : (
            <span className="text-xs opacity-75">{exercise?.name}</span>
          )}
        </div>
      )}

      {/* Overlay avec message - sous la barre verte */}
      {currentStep && !fullscreen && (
        <div className="flex-none bg-[#2d5016]/90 text-white px-4 py-1 flex items-center justify-center gap-2">
          {audio.isPlaying && (
            <div className="flex gap-0.5">
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          )}
          <span className="text-base font-medium">
            {currentStep.message.title}
          </span>
          <span className="text-[#c9a959] text-sm">
            {currentStep.message.subtitle}
          </span>
          {lastAudioVerse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                audio.play(lastAudioVerse);
              }}
              aria-label="Faire répéter le verset"
              className="ml-1 w-7 h-7 rounded-full flex items-center justify-center bg-[#c9a959]/20 text-[#c9a959] hover:bg-[#c9a959]/35 active:scale-95 transition-all flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Boutons de niveau Hifz (uniquement pour l'exercice Hifz, masqués en plein écran) */}
      {isHifz && !fullscreen && (
        <div className="flex-none bg-[#2d5016]/95 text-white px-2 py-2 flex items-center justify-center gap-1 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMistakes((s) => !s);
            }}
            title="Afficher/masquer les fautes déclarées en Récitation"
            className={`h-8 px-2.5 rounded-md text-xs font-bold transition-colors mr-2 border ${
              showMistakes && mistakeWords.size > 0
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-[#2d5016] text-[#c9a959] border-[#4a7c23] hover:bg-[#3e6b1d]'
            }`}
          >
            Fautes {mistakeWords.size > 0 ? `(${toArabicNumbers(mistakeWords.size)})` : ''}
          </button>
          <span className="text-xs uppercase tracking-wide text-[#c9a959] mr-2">Niveau</span>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
            <button
              key={lvl}
              onClick={(e) => {
                e.stopPropagation();
                setHifzLevel(lvl);
              }}
              className={`min-w-[36px] h-8 px-2 rounded-md text-sm font-bold transition-colors ${
                hifzLevel === lvl
                  ? 'bg-[#c9a959] text-[#2d5016] shadow-md'
                  : 'bg-[#2d5016] hover:bg-[#3e6b1d] text-[#c9a959] border border-[#4a7c23]'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}

      {/* Zone Mushaf */}
      <div className="flex-1 min-h-0 relative" onClick={handleMushafClick}>
        {/* Bouton discret pour quitter le plein écran (Hifz) */}
        {fullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReadingMode(false);
            }}
            aria-label="Quitter le plein écran"
            className="absolute right-2 top-2 z-30 w-10 h-10 rounded-full flex items-center justify-center bg-[#2d5016]/70 text-[#fdfaf3] hover:bg-[#2d5016] shadow-lg border border-[#c9a959]/40 active:scale-95 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
        )}
        <MushafDoublePage
          leftPageVerses={leftPageVerses}
          rightPageVerses={rightPageVerses}
          pagePair={pagePair}
          orientation={orientation}
          revealedVerses={visibleVerses}
          visibleVerses={visibleVerses}
          isBlurred={isBlurred}
          maskAll={maskAll}
          wordMarks={isHifz && showMistakes ? mistakeWords : undefined}
          loading={loading}
          singlePage={singlePage}
          currentPage={singlePage ? displayedPage : undefined}
          hifzLevel={exerciseId === 'hifz' ? hifzLevel : undefined}
          onTap={handleTap}
        />

        {/* Boutons de feuilletage (Hifz) : extrémités gauche/droite, centrés verticalement.
            Lecture RTL : avancer (pages suivantes) = aller vers la GAUCHE. */}
        {exerciseId === 'hifz' && (
          <>
            {/* Droite de l'écran → pages précédentes (numéros plus petits) */}
            <button
              type="button"
              aria-label="Pages précédentes"
              disabled={!canFlipPrev}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                flipPair('prev');
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipPrev
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>

            {/* Gauche de l'écran → pages suivantes (numéros plus grands) */}
            <button
              type="button"
              aria-label="Pages suivantes"
              disabled={!canFlipNext}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                flipPair('next');
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipNext
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Question de fin de tour : « Avez-vous trouvé ? » (exercices de quiz) */}
      {askFound && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-[#fdfaf3] border-2 border-[#c9a959] rounded-2xl shadow-xl p-5 w-[min(90vw,340px)] text-center">
            <p className="text-lg font-bold text-[#2d5016] mb-1">Avez-vous trouvé ?</p>
            <p className="text-xs text-gray-500 mb-4">
              Votre réponse oriente les prochaines questions vers ce que vous ratez.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => answerFound(true)}
                className="flex-1 py-3 rounded-xl bg-[#2d5016] hover:bg-[#4a7c23] text-white font-bold active:scale-95 transition-all"
              >
                ✓ Oui
              </button>
              <button
                type="button"
                onClick={() => answerFound(false)}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold active:scale-95 transition-all"
              >
                ✗ Non
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popover de traduction Hamidullah, positionné au point cliqué (Hifz uniquement) */}
      {isHifz && popover && (() => {
        const [s, a] = popover.verseKey.split(':').map(Number);
        const chapter = quranUnits?.chapters.find((c) => c.id === s);
        const text = translations?.[popover.verseKey];
        return (
          <div
            ref={popoverRef}
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: popoverPos ? popoverPos.left : popover.x,
              top: popoverPos ? popoverPos.top : popover.y,
              visibility: popoverPos ? 'visible' : 'hidden',
            }}
            className="fixed z-40 w-[min(88vw,340px)] max-h-[60vh] overflow-y-auto bg-[#fdfaf3] border-2 border-[#c9a959] shadow-[0_8px_28px_rgba(45,80,22,0.28)] rounded-xl"
          >
            <div className="px-3.5 pt-2.5 pb-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#c9a959]">
                    Traduction — Hamidullah
                  </div>
                  <div className="text-sm font-bold text-[#2d5016] mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>
                      {s}:{a}
                      {chapter ? ` · ${chapter.name_simple}` : ''}
                    </span>
                    {chapter && (
                      <span
                        className="text-[#7a8b3e]"
                        dir="rtl"
                        style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
                      >
                        {chapter.name_arabic}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Fermer la traduction"
                  onClick={() => setPopover(null)}
                  className="flex-none w-7 h-7 rounded-full flex items-center justify-center bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20 active:scale-95 transition"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-[14px] leading-relaxed text-[#1a1a1a]">
                {text
                  ? text
                  : translationLoading
                    ? 'Chargement de la traduction…'
                    : 'Traduction indisponible pour ce verset.'}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
