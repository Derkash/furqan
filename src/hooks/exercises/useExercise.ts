'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  ExerciseState,
  ExerciseConfig,
  ExerciseStep,
  ExerciseRound,
  ExerciseId,
} from '@/types/exercises';
import type { PageVerses, PagePair } from '@/types';
import { getExerciseDefinition } from '@/utils/exercises/exerciseRegistry';
import { STEP_GENERATORS } from '@/lib/exercises/stepGenerators';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { useVerseMap } from '@/hooks/useVerseMap';

interface UseExerciseReturn {
  // State
  state: ExerciseState;
  currentStep: ExerciseStep | null;

  // Page data
  leftPageVerses: PageVerses | null;
  rightPageVerses: PageVerses | null;
  pagePair: PagePair;

  // UI helpers
  isBlurred: boolean;
  maskAll: boolean;
  visibleVerses: Set<string>;
  highlightedVerse: string | null;

  // Loading
  loading: boolean;

  // Actions
  initialize: (config: ExerciseConfig) => Promise<void>;
  start: () => void;
  nextStep: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

const initialState: ExerciseState = {
  exerciseId: 'random-verse',
  config: { startPage: 3, endPage: 10, exerciseId: 'random-verse' },
  currentRound: null,
  progress: {
    currentPage: 3,
    pagesCompleted: 0,
    totalPages: 0,
    roundsCompleted: 0,
    totalRounds: 0,
  },
  status: 'idle',
};

function getPagePair(page: number): PagePair {
  const rightPage = page % 2 === 1 ? page : page - 1;
  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, rightPage + 1),
  };
}

export function useExercise(): UseExerciseReturn {
  const [state, setState] = useState<ExerciseState>(initialState);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);

  // Charger le verse-map pour les positions précises
  const { getPageVerses: getVerseMapPage } = useVerseMap();

  // Current step
  const currentStep = useMemo(() => {
    if (!state.currentRound) return null;
    return state.currentRound.steps[state.currentRound.currentStepIndex] || null;
  }, [state.currentRound]);

  // UI state from current step
  const isBlurred = currentStep?.ui.isBlurred ?? false;
  const maskAll = currentStep?.ui.maskAll ?? false;
  const visibleVerses = useMemo(
    () => new Set(currentStep?.ui.visibleVerses ?? []),
    [currentStep]
  );
  const highlightedVerse = currentStep?.ui.highlightedVerse ?? null;

  // Page pair
  const pagePair = useMemo(
    () => getPagePair(state.progress.currentPage),
    [state.progress.currentPage]
  );

  // Load pages when page changes
  useEffect(() => {
    if (state.status !== 'running') return;

    async function loadPages() {
      setLoading(true);
      try {
        const [left, right] = await Promise.all([
          fetchPageVerses(pagePair.leftPage),
          fetchPageVerses(pagePair.rightPage),
        ]);
        setLeftPageVerses(left);
        setRightPageVerses(right);
      } catch (error) {
        console.error('Error loading pages:', error);
      } finally {
        setLoading(false);
      }
    }

    loadPages();
  }, [pagePair.leftPage, pagePair.rightPage, state.status]);

  // Generate round for current page
  const generateCurrentRound = useCallback(async () => {
    const generator = STEP_GENERATORS[state.exerciseId];
    if (!generator) return;

    setLoading(true);
    try {
      const pageVerses = await fetchPageVerses(state.progress.currentPage);
      // Récupérer les données du verse-map pour les positions précises
      const verseMapData = getVerseMapPage(state.progress.currentPage);
      const steps = generator(pageVerses, state.progress.currentPage, state.config, verseMapData);

      const round: ExerciseRound = {
        roundIndex: state.progress.roundsCompleted,
        totalRounds: state.progress.totalPages,
        pageNumber: state.progress.currentPage,
        steps,
        currentStepIndex: 0,
      };

      setState((prev) => ({ ...prev, currentRound: round }));
    } catch (error) {
      console.error('Error generating round:', error);
    } finally {
      setLoading(false);
    }
  }, [state.exerciseId, state.progress.currentPage, state.config, state.progress.roundsCompleted, state.progress.totalPages, getVerseMapPage]);

  // Initialize
  const initialize = useCallback(async (config: ExerciseConfig) => {
    const definition = getExerciseDefinition(config.exerciseId);
    if (!definition) {
      console.error(`Exercise ${config.exerciseId} not found`);
      return;
    }

    const totalPages = config.endPage - config.startPage + 1;
    const startPage =
      definition.progression === 'backward' ? config.endPage : config.startPage;

    setState({
      exerciseId: config.exerciseId,
      config,
      currentRound: null,
      progress: {
        currentPage: startPage,
        pagesCompleted: 0,
        totalPages,
        roundsCompleted: 0,
        totalRounds: totalPages,
      },
      status: 'idle',
    });
  }, []);

  // Start
  const start = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'running' }));
  }, []);

  // Next step
  const nextStep = useCallback(async () => {
    if (!state.currentRound) {
      await generateCurrentRound();
      return;
    }

    const { currentStepIndex, steps } = state.currentRound;
    const nextIndex = currentStepIndex + 1;

    if (nextIndex < steps.length) {
      // Move to next step
      setState((prev) => ({
        ...prev,
        currentRound: prev.currentRound
          ? { ...prev.currentRound, currentStepIndex: nextIndex }
          : null,
      }));
    } else {
      // Round complete - move to next page
      const definition = getExerciseDefinition(state.exerciseId);
      if (!definition) return;

      const { currentPage, pagesCompleted, totalPages } = state.progress;

      if (pagesCompleted + 1 >= totalPages) {
        // Exercise complete
        setState((prev) => ({ ...prev, status: 'completed' }));
        return;
      }

      // Calculate next page
      const nextPage =
        definition.progression === 'backward' ? currentPage - 1 : currentPage + 1;

      setState((prev) => ({
        ...prev,
        currentRound: null,
        progress: {
          ...prev.progress,
          currentPage: nextPage,
          pagesCompleted: pagesCompleted + 1,
          roundsCompleted: prev.progress.roundsCompleted + 1,
        },
      }));
    }
  }, [state.currentRound, state.exerciseId, state.progress, generateCurrentRound]);

  // Generate round when status becomes running and no current round
  useEffect(() => {
    if (state.status === 'running' && !state.currentRound && !loading) {
      generateCurrentRound();
    }
  }, [state.status, state.currentRound, loading, generateCurrentRound]);

  // Pause
  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'paused' }));
  }, []);

  // Resume
  const resume = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'running' }));
  }, []);

  // Reset
  const reset = useCallback(() => {
    setState(initialState);
    setLeftPageVerses(null);
    setRightPageVerses(null);
  }, []);

  return {
    state,
    currentStep,
    leftPageVerses,
    rightPageVerses,
    pagePair,
    isBlurred,
    maskAll,
    visibleVerses,
    highlightedVerse,
    loading,
    initialize,
    start,
    nextStep,
    pause,
    resume,
    reset,
  };
}
