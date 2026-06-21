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
  singlePage: boolean;
  hifzLevel: number;
  setHifzLevel: (level: number) => void;
  /** Page courante affichée (utile en singlePage mode). */
  displayedPage: number;

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

// Exercices qui interrogent sur une seule page aléatoire de la double page
// et sautent des doubles pages aléatoirement
const DOUBLE_PAGE_RANDOM_EXERCISES: ExerciseId[] = [
  'random-start-middle-end',
  'random-verse',
  'find-recited-verse',
];

// Exercices affichés en single page (une seule page à la fois, pas de double page)
const SINGLE_PAGE_EXERCISES: ExerciseId[] = ['hifz'];

export function useExercise(): UseExerciseReturn {
  const [state, setState] = useState<ExerciseState>(initialState);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [hifzLevel, setHifzLevel] = useState(0);

  // Charger le verse-map pour les positions précises
  const { getPageVerses: getVerseMapPage } = useVerseMap();

  // Current step
  const currentStep = useMemo(() => {
    if (!state.currentRound) return null;
    return state.currentRound.steps[state.currentRound.currentStepIndex] || null;
  }, [state.currentRound]);

  // Pendant les transitions entre rounds (running mais step non encore prêt),
  // on garde le mode masqué+flou pour éviter l'éclair où tout le texte apparaît.
  const inTransition = state.status === 'running' && !currentStep;
  const isBlurred = currentStep?.ui.isBlurred ?? inTransition;
  const maskAll = currentStep?.ui.maskAll ?? inTransition;

  // Versets visibles : uniquement ceux du step courant. Pas d'accumulation cross-round
  // (sinon les versets révélés sur la double page précédente persistent quand on tire
  //  une nouvelle question sur la même page).
  const visibleVerses = useMemo(() => {
    return new Set(currentStep?.ui.visibleVerses ?? []);
  }, [currentStep]);

  const highlightedVerse = currentStep?.ui.highlightedVerse ?? null;
  const singlePage = currentStep?.ui.singlePage ?? SINGLE_PAGE_EXERCISES.includes(state.exerciseId);
  const displayedPage = state.currentRound?.pageNumber ?? state.progress.currentPage;

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
      // Pour les exercices double-page aléatoire, choisir aléatoirement entre les deux pages
      let pageToUse = state.progress.currentPage;
      if (DOUBLE_PAGE_RANDOM_EXERCISES.includes(state.exerciseId)) {
        const pair = getPagePair(state.progress.currentPage);
        // Choisir aléatoirement entre page gauche et page droite
        pageToUse = Math.random() < 0.5 ? pair.rightPage : pair.leftPage;
      }

      const pageVerses = await fetchPageVerses(pageToUse);
      // Récupérer les données du verse-map pour les positions précises
      const verseMapData = getVerseMapPage(pageToUse);
      const steps = generator(pageVerses, pageToUse, state.config, verseMapData);

      const round: ExerciseRound = {
        roundIndex: state.progress.roundsCompleted,
        totalRounds: state.progress.totalPages,
        pageNumber: pageToUse,
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
      const { startPage, endPage } = state.config;

      // Pour les exercices double-page aléatoire, sauter à une double page aléatoire
      const isDoublePageExercise = DOUBLE_PAGE_RANDOM_EXERCISES.includes(state.exerciseId);

      if (pagesCompleted + 1 >= totalPages) {
        // Exercise complete
        setState((prev) => ({ ...prev, status: 'completed' }));
        return;
      }

      let nextPage: number;

      if (isDoublePageExercise) {
        // Calculer une double page aléatoire dans la plage restante
        // Nombre de doubles pages disponibles
        const startDoublePage = Math.floor((startPage - 1) / 2);
        const endDoublePage = Math.floor((endPage - 1) / 2);
        const totalDoublePages = endDoublePage - startDoublePage + 1;

        // Choisir une double page aléatoire
        const randomDoublePageIndex = Math.floor(Math.random() * totalDoublePages);
        const randomDoublePage = startDoublePage + randomDoublePageIndex;

        // Convertir en numéro de page (page impaire de la double page)
        nextPage = randomDoublePage * 2 + 1;

        // S'assurer qu'on reste dans la plage
        nextPage = Math.max(startPage, Math.min(endPage, nextPage));
      } else {
        // Progression normale page par page
        nextPage =
          definition.progression === 'backward'
            ? currentPage - 1
            : currentPage + 1;
      }

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
    setHifzLevel(0);
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
    singlePage,
    hifzLevel,
    setHifzLevel,
    displayedPage,
    loading,
    initialize,
    start,
    nextStep,
    pause,
    resume,
    reset,
  };
}
