'use client';

import { useEffect } from 'react';
import ConfigScreen from '@/components/ConfigScreen';
import MushafDoublePage from '@/components/MushafDoublePage';
import QuizOverlay from '@/components/QuizOverlay';
import { useQuiz } from '@/hooks/useQuiz';
import { useAudio } from '@/hooks/useAudio';
import { useOrientation } from '@/hooks/useOrientation';
import type { QuizConfig } from '@/types';

export default function Home() {
  const {
    state,
    startQuiz,
    nextStep,
    reset,
    leftPageVerses,
    rightPageVerses,
    pagePair,
    isBlurred,
    visibleVerses,
    maskAll,
    loading,
  } = useQuiz();

  const { isPlaying, play, stop } = useAudio();
  const orientation = useOrientation();

  // Jouer l'audio quand on entre dans l'état "listening"
  useEffect(() => {
    if (state.step === 'listening' && state.targetVerse) {
      play(state.targetVerse);
    }
  }, [state.step, state.targetVerse, play]);

  // Arrêter l'audio quand on quitte "listening"
  useEffect(() => {
    if (state.step !== 'listening') {
      stop();
    }
  }, [state.step, stop]);

  // Handler pour démarrer le quiz
  const handleStart = (config: QuizConfig) => {
    startQuiz(config);
  };

  // Handler pour tap sur l'écran
  const handleTap = () => {
    if (state.step !== 'config' && !loading) {
      nextStep();
    }
  };

  // Afficher l'écran de configuration
  if (state.step === 'config') {
    return <ConfigScreen onStart={handleStart} />;
  }

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#fdfaf3',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Indicateur de chargement global */}
      {loading && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 50 }}>
          <div
            style={{
              width: 24,
              height: 24,
              border: '2px solid #2d5016',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      )}

      {/* Double page du Mushaf */}
      <MushafDoublePage
        leftPageVerses={leftPageVerses}
        rightPageVerses={rightPageVerses}
        pagePair={pagePair}
        orientation={orientation}
        revealedVerses={state.revealedVerses}
        visibleVerses={visibleVerses}
        isBlurred={isBlurred}
        maskAll={maskAll}
        loading={loading}
        onTap={handleTap}
      />

      {/* Overlay du quiz */}
      <QuizOverlay step={state.step} isPlaying={isPlaying} />

      {/* Bouton retour à la configuration */}
      <button
        onClick={reset}
        className="absolute top-4 left-4 z-50 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-colors"
        title="Retour à la configuration"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-[#2d5016]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </main>
  );
}
