'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useExercise } from '@/hooks/exercises/useExercise';
import { useAudio } from '@/hooks/useAudio';
import type { Orientation } from '@/types';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import MushafDoublePage from '@/components/MushafDoublePage';
import type { ExerciseId, VersePositionType } from '@/types/exercises';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import Link from 'next/link';

export default function PracticePage() {
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
  // Mode lecture plein écran (Hifz) : masque les barres du haut pour maximiser la lecture.
  const [readingMode, setReadingMode] = useState(false);
  const isHifz = exerciseId === 'hifz';
  const fullscreen = isHifz && readingMode;

  // Initialize exercise
  useEffect(() => {
    if (!isValidExerciseId(exerciseId) || initialized) return;

    const parsePositions = (s: string | null): VersePositionType[] =>
      (s ? s.split(',').filter(Boolean) : []) as VersePositionType[];

    initialize({
      exerciseId: exerciseId as ExerciseId,
      startPage,
      endPage,
      identifyPosition: (identifyParam ?? undefined) as VersePositionType | undefined,
      revealAfter: parsePositions(revealParam),
      showPositions: parsePositions(showParam),
      direction: (dirParam ?? undefined) as 'forward' | 'backward' | undefined,
    }).then(() => {
      setInitialized(true);
    });
  }, [exerciseId, startPage, endPage, identifyParam, revealParam, showParam, dirParam, initialize, initialized]);

  // Auto-start when initialized
  useEffect(() => {
    if (initialized && state.status === 'idle') {
      start();
    }
  }, [initialized, state.status, start]);

  // Play audio when step is listening
  // Note: on utilise audio.play dans une ref pour éviter les boucles infinies
  const audioPlayRef = useRef(audio.play);
  audioPlayRef.current = audio.play;

  useEffect(() => {
    if (currentStep?.type === 'listening' && currentStep.targetVerse) {
      audioPlayRef.current(currentStep.targetVerse);
    }
  }, [currentStep]);

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
            Vous avez terminé {toArabicNumbers(state.progress.totalPages)} pages
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
                Page {toArabicNumbers(state.progress.currentPage)} •{' '}
                {toArabicNumbers(state.progress.pagesCompleted + 1)}/
                {toArabicNumbers(state.progress.totalPages)}
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
        </div>
      )}

      {/* Boutons de niveau Hifz (uniquement pour l'exercice Hifz, masqués en plein écran) */}
      {isHifz && !fullscreen && (
        <div className="flex-none bg-[#2d5016]/95 text-white px-2 py-2 flex items-center justify-center gap-1 flex-wrap">
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
      <div className="flex-1 min-h-0 relative">
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
    </div>
  );
}
