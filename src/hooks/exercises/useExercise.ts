'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  ExerciseState,
  ExerciseConfig,
  ExerciseStep,
  ExerciseRound,
  ExerciseId,
  ProgressionDirection,
} from '@/types/exercises';
import type { PageVerses, PagePair } from '@/types';
import { getExerciseDefinition } from '@/utils/exercises/exerciseRegistry';
import { STEP_GENERATORS } from '@/lib/exercises/stepGenerators';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { useVerseMap } from '@/hooks/useVerseMap';
import { getCurrentUser, getPriorityPages } from '@/utils/exercises/userStats';

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

  // Navigation double page (feuilleter) — utilisé par Hifz
  canFlipPrev: boolean;
  canFlipNext: boolean;
  flipPair: (direction: 'prev' | 'next') => void;

  // Actions
  initialize: (config: ExerciseConfig) => Promise<void>;
  start: () => void;
  nextStep: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

const initialState: ExerciseState = {
  exerciseId: 'audio-quiz',
  config: { startPage: 3, endPage: 10, exerciseId: 'audio-quiz' },
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
const DOUBLE_PAGE_RANDOM_EXERCISES: ExerciseId[] = ['audio-quiz'];

/**
 * Sens de progression effectif : pour le Séquentiel il vient de la config
 * (choix de l'utilisateur), sinon de la définition statique de l'exercice.
 */
function isBackward(
  exerciseId: ExerciseId,
  config: ExerciseConfig,
  progression: ProgressionDirection
): boolean {
  if (exerciseId === 'sequential') return config.direction === 'backward';
  return progression === 'backward';
}

// Exercices affichés en single page (une seule page à la fois, pas de double page)
// (Hifz est désormais affiché en double page, comme les autres exercices.)
const SINGLE_PAGE_EXERCISES: ExerciseId[] = [];

/** Renvoie la page impaire (droite) de la double page contenant `page`. */
function pairRightPage(page: number): number {
  return Math.max(1, page % 2 === 1 ? page : page - 1);
}

/**
 * Tire une page aléatoire dans [startPage, endPage] en évitant les `avoidRecent`
 * dernières pages visitées. Réinitialise correctement si toute la fenêtre
 * récente couvre la plage.
 *
 * Adaptation aux fautes : ~50 % du temps, la page est tirée parmi celles
 * contenant des mots/versets en erreur (mémoire utilisateur), en mixant
 * avec le tirage uniforme pour ne pas tourner qu'autour des erreurs.
 */
function pickRandomPage(
  startPage: number,
  endPage: number,
  recent: number[],
  avoidRecent = 5
): number {
  const rangeSize = endPage - startPage + 1;
  if (rangeSize <= 1) return startPage;

  const window = Math.min(avoidRecent, rangeSize - 1);
  const blocked = new Set(recent.slice(-window));

  const available: number[] = [];
  for (let p = startPage; p <= endPage; p++) {
    if (!blocked.has(p)) available.push(p);
  }

  const pool = available.length > 0 ? available : Array.from({ length: rangeSize }, (_, i) => startPage + i);

  const priority = getPriorityPages(getCurrentUser(), startPage, endPage);
  if (priority.size > 0 && Math.random() < 0.5) {
    const priorityPool = pool.filter((p) => priority.has(p));
    if (priorityPool.length > 0) {
      return priorityPool[Math.floor(Math.random() * priorityPool.length)];
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function useExercise(): UseExerciseReturn {
  const [state, setState] = useState<ExerciseState>(initialState);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [hifzLevel, setHifzLevel] = useState(0);

  // Historique des pages récemment visitées (pour éviter les répétitions immédiates)
  const recentPagesRef = useRef<number[]>([]);

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
      // La page courante a déjà été tirée au sort (par initialize ou nextStep) avec
      // pickRandomPage, donc on l'utilise telle quelle — pas besoin d'un second tirage
      // entre gauche/droite qui sortirait des pages que recentPagesRef ne connaît pas.
      const pageToUse = state.progress.currentPage;
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
    // Nombre de questions demandé : libre pour les exercices à tirage aléatoire
    // (les pages peuvent revenir), borné au nombre de pages pour les séquentiels.
    const isRandomExercise = DOUBLE_PAGE_RANDOM_EXERCISES.includes(config.exerciseId);
    const totalRounds = config.maxRounds
      ? isRandomExercise
        ? config.maxRounds
        : Math.min(config.maxRounds, totalPages)
      : totalPages;

    // Reset historique pour le nouvel exercice
    recentPagesRef.current = [];

    // Page de départ : aléatoire pour les exos random, sinon début/fin selon progression
    let startPage: number;
    if (DOUBLE_PAGE_RANDOM_EXERCISES.includes(config.exerciseId)) {
      startPage = pickRandomPage(config.startPage, config.endPage, []);
    } else if (isBackward(config.exerciseId, config, definition.progression)) {
      startPage = config.endPage;
    } else {
      startPage = config.startPage;
    }

    recentPagesRef.current.push(startPage);

    setState({
      exerciseId: config.exerciseId,
      config,
      currentRound: null,
      progress: {
        currentPage: startPage,
        pagesCompleted: 0,
        totalPages,
        roundsCompleted: 0,
        totalRounds,
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

      const { currentPage, pagesCompleted, totalRounds } = state.progress;
      const { startPage, endPage } = state.config;

      // Pour les exercices double-page aléatoire, sauter à une double page aléatoire
      const isDoublePageExercise = DOUBLE_PAGE_RANDOM_EXERCISES.includes(state.exerciseId);

      if (pagesCompleted + 1 >= totalRounds) {
        // Exercise complete (nombre de questions atteint)
        setState((prev) => ({ ...prev, status: 'completed' }));
        return;
      }

      let nextPage: number;

      if (isDoublePageExercise) {
        // Page aléatoire dans la plage en évitant les pages récemment vues
        nextPage = pickRandomPage(startPage, endPage, recentPagesRef.current);
      } else {
        // Progression normale page par page, sens selon la config (Séquentiel)
        nextPage = isBackward(state.exerciseId, state.config, definition.progression)
          ? currentPage - 1
          : currentPage + 1;
      }

      recentPagesRef.current.push(nextPage);
      // Garde un historique borné pour éviter qu'il grossisse indéfiniment
      if (recentPagesRef.current.length > 20) recentPagesRef.current.shift();

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
  }, [state.currentRound, state.exerciseId, state.config, state.progress, generateCurrentRound]);

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

  // Navigation double page (feuilleter) dans la plage [startPage, endPage].
  // Ne régénère pas le round : on déplace simplement la double page courante, ce qui
  // déclenche le rechargement des pages via l'effet de chargement. Le niveau de Hifz
  // courant est conservé.
  const { startPage: cfgStart, endPage: cfgEnd } = state.config;
  const flipBounds = useMemo(() => {
    const lo = pairRightPage(Math.min(cfgStart, cfgEnd));
    const hi = pairRightPage(Math.max(cfgStart, cfgEnd));
    const cur = pairRightPage(state.progress.currentPage);
    return { lo, hi, cur };
  }, [cfgStart, cfgEnd, state.progress.currentPage]);

  const canFlipPrev = flipBounds.cur > flipBounds.lo;
  const canFlipNext = flipBounds.cur < flipBounds.hi;

  const flipPair = useCallback((direction: 'prev' | 'next') => {
    setState((prev) => {
      const lo = pairRightPage(Math.min(prev.config.startPage, prev.config.endPage));
      const hi = pairRightPage(Math.max(prev.config.startPage, prev.config.endPage));
      const cur = pairRightPage(prev.progress.currentPage);
      let target = cur + (direction === 'next' ? 2 : -2);
      if (target < lo) target = lo;
      if (target > hi) target = hi;
      if (target === cur) return prev;
      return { ...prev, progress: { ...prev.progress, currentPage: target } };
    });
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
    canFlipPrev,
    canFlipNext,
    flipPair,
    initialize,
    start,
    nextStep,
    pause,
    resume,
    reset,
  };
}
