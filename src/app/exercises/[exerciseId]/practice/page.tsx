'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useExercise } from '@/hooks/exercises/useExercise';
import { useOrientation } from '@/hooks/useOrientation';
import { useAudio } from '@/hooks/useAudio';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import MushafDoublePage from '@/components/MushafDoublePage';
import type { ExerciseId } from '@/types/exercises';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import Link from 'next/link';

export default function PracticePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const exerciseId = params.exerciseId as string;

  const startPage = Number(searchParams.get('start')) || 3;
  const endPage = Number(searchParams.get('end')) || 10;

  const {
    state,
    currentStep,
    leftPageVerses,
    rightPageVerses,
    pagePair,
    isBlurred,
    maskAll,
    visibleVerses,
    loading,
    initialize,
    start,
    nextStep,
    reset,
  } = useExercise();

  const orientation = useOrientation();
  const audio = useAudio();
  const [initialized, setInitialized] = useState(false);

  // Initialize exercise
  useEffect(() => {
    if (!isValidExerciseId(exerciseId) || initialized) return;

    initialize({
      exerciseId: exerciseId as ExerciseId,
      startPage,
      endPage,
    }).then(() => {
      setInitialized(true);
    });
  }, [exerciseId, startPage, endPage, initialize, initialized]);

  // Auto-start when initialized
  useEffect(() => {
    if (initialized && state.status === 'idle') {
      start();
    }
  }, [initialized, state.status, start]);

  // Play audio when step is listening
  useEffect(() => {
    if (currentStep?.type === 'listening' && currentStep.targetVerse) {
      audio.play(currentStep.targetVerse);
    }
  }, [currentStep, audio]);

  // Handle tap
  const handleTap = () => {
    if (state.status === 'completed') {
      router.push(`/exercises/${exerciseId}/setup`);
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
      <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
        <Link
          href={`/exercises/${exerciseId}/setup`}
          className="text-sm hover:underline"
        >
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Page {toArabicNumbers(state.progress.currentPage)} •{' '}
          {toArabicNumbers(state.progress.pagesCompleted + 1)}/
          {toArabicNumbers(state.progress.totalPages)}
        </span>
        <span className="text-xs opacity-75">{exercise?.name}</span>
      </div>

      {/* Zone Mushaf */}
      <div className="flex-1 min-h-0 relative">
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
          onTap={handleTap}
        />

        {/* Overlay avec message */}
        {currentStep && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none z-50">
            <div className="bg-[#2d5016]/95 text-white px-6 py-2 rounded-lg shadow-2xl text-center max-w-sm mx-4">
              {audio.isPlaying && (
                <div className="flex justify-center gap-1 mb-2">
                  <span
                    className="w-1 h-4 bg-[#c9a959] rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1 h-4 bg-[#c9a959] rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1 h-4 bg-[#c9a959] rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              )}
              <h3 className="text-lg font-semibold mb-0.5">
                {currentStep.message.title}
              </h3>
              <p className="text-[#c9a959] text-sm">
                {currentStep.message.subtitle}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
