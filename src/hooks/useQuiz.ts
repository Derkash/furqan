'use client';

import { useState, useCallback, useEffect } from 'react';
import type { QuizState, QuizStep, QuizConfig, VersePosition, PageVerses, PagePair } from '@/types';
import { fetchPageVerses } from './usePageVerses';

interface UseQuizReturn {
  state: QuizState;
  startQuiz: (config: QuizConfig) => void;
  nextStep: () => void;
  reset: () => void;
  // Données des pages actuelles
  leftPageVerses: PageVerses | null;
  rightPageVerses: PageVerses | null;
  pagePair: PagePair;
  // Helpers pour l'affichage
  isBlurred: boolean;
  visibleVerses: Set<string>;
  maskAll: boolean;
  loading: boolean;
}

const initialState: QuizState = {
  step: 'config',
  config: { startPage: 1, endPage: 10 },
  targetVerse: null,
  currentPage: 1,
  revealedVerses: new Set(),
};

/**
 * Machine à états du quiz (simplifiée - sans les étapes ask_*)
 * Les questions s'affichent en même temps que les révélations
 */
const STATE_MACHINE: Record<QuizStep, QuizStep> = {
  config: 'listening',
  listening: 'reveal_recited',
  reveal_recited: 'reveal_first',
  ask_first: 'reveal_first', // Gardé pour compatibilité
  reveal_first: 'reveal_last',
  ask_last: 'reveal_last', // Gardé pour compatibilité
  reveal_last: 'listening', // Boucle vers le prochain tour
};

/**
 * Obtenir la paire de pages pour affichage double page RTL
 */
function getPagePair(page: number): PagePair {
  // En RTL: page impaire à droite, page paire à gauche
  const rightPage = page % 2 === 1 ? page : page - 1;
  const leftPage = rightPage + 1;

  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, leftPage),
  };
}

/**
 * Hook pour gérer la machine à états du quiz
 */
export function useQuiz(): UseQuizReturn {
  const [state, setState] = useState<QuizState>(initialState);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagesCache, setPagesCache] = useState<Map<number, PageVerses>>(new Map());

  // Calculer la paire de pages actuelle
  const pagePair = getPagePair(state.currentPage);

  // Charger les données des pages quand la page change
  useEffect(() => {
    if (state.step === 'config') return;

    async function loadPages() {
      setLoading(true);
      try {
        const [left, right] = await Promise.all([
          fetchPageVerses(pagePair.leftPage),
          fetchPageVerses(pagePair.rightPage),
        ]);

        setLeftPageVerses(left);
        setRightPageVerses(right);

        // Mettre en cache
        setPagesCache((prev) => {
          const newCache = new Map(prev);
          newCache.set(pagePair.leftPage, left);
          newCache.set(pagePair.rightPage, right);
          return newCache;
        });
      } catch (error) {
        console.error('Erreur lors du chargement des pages:', error);
      } finally {
        setLoading(false);
      }
    }

    loadPages();
  }, [pagePair.leftPage, pagePair.rightPage, state.step]);

  // Sélectionner un verset aléatoire dans une plage de pages
  const selectRandomVerse = useCallback(
    async (startPage: number, endPage: number): Promise<VersePosition | null> => {
      const allVerses: VersePosition[] = [];

      // Charger toutes les pages de la plage
      for (let page = startPage; page <= endPage; page++) {
        try {
          let pageVerses = pagesCache.get(page);
          if (!pageVerses) {
            pageVerses = await fetchPageVerses(page);
            setPagesCache((prev) => {
              const newCache = new Map(prev);
              newCache.set(page, pageVerses!);
              return newCache;
            });
          }
          allVerses.push(...pageVerses.verses);
        } catch (error) {
          console.error(`Erreur chargement page ${page}:`, error);
        }
      }

      if (allVerses.length === 0) return null;

      // Sélectionner un verset aléatoire
      const randomIndex = Math.floor(Math.random() * allVerses.length);
      return allVerses[randomIndex];
    },
    [pagesCache]
  );

  // Démarrer le quiz avec une configuration
  const startQuiz = useCallback(
    async (config: QuizConfig) => {
      setLoading(true);

      // Sélectionner un verset aléatoire
      const randomVerse = await selectRandomVerse(config.startPage, config.endPage);

      if (!randomVerse) {
        console.error('Aucun verset trouvé dans la plage');
        setLoading(false);
        return;
      }

      setState({
        step: 'listening',
        config,
        targetVerse: randomVerse,
        currentPage: randomVerse.page,
        revealedVerses: new Set(),
      });

      setLoading(false);
    },
    [selectRandomVerse]
  );

  // Passer à l'étape suivante
  const nextStep = useCallback(async () => {
    const currentStep = state.step;
    const nextStepValue = STATE_MACHINE[currentStep];

    // Si on passe à un nouveau tour, sélectionner un nouveau verset
    if (currentStep === 'reveal_last') {
      setLoading(true);
      const newRandomVerse = await selectRandomVerse(
        state.config.startPage,
        state.config.endPage
      );

      if (newRandomVerse) {
        setState((prev) => ({
          ...prev,
          step: 'listening',
          targetVerse: newRandomVerse,
          currentPage: newRandomVerse.page,
          revealedVerses: new Set(),
        }));
      }
      setLoading(false);
      return;
    }

    setState((prev) => {
      return {
        ...prev,
        step: nextStepValue,
      };
    });
  }, [state, selectRandomVerse]);

  // Réinitialiser le quiz
  const reset = useCallback(() => {
    setState(initialState);
    setLeftPageVerses(null);
    setRightPageVerses(null);
  }, []);

  // === LOGIQUE D'AFFICHAGE SELON L'ÉTAT ===

  // FLOU: uniquement pendant listening
  const isBlurred = state.step === 'listening';

  // MASQUAGE: dans tous les états sauf config et listening (car listening utilise le flou)
  const maskAll = !['config', 'listening'].includes(state.step);

  // VERSETS VISIBLES: accumule les versets révélés (ils restent visibles une fois révélés)
  const getVisibleVerses = (): Set<string> => {
    const verses = new Set<string>();

    const targetPageVerses = state.targetVerse?.page === pagePair.rightPage
      ? rightPageVerses
      : leftPageVerses;

    // Après reveal_recited, le verset récité reste visible
    if (['reveal_recited', 'reveal_first', 'reveal_last'].includes(state.step)) {
      if (state.targetVerse?.verseKey) {
        verses.add(state.targetVerse.verseKey);
      }
    }

    // Après reveal_first, le premier verset reste aussi visible
    if (['reveal_first', 'reveal_last'].includes(state.step)) {
      if (targetPageVerses?.firstVerse?.verseKey) {
        verses.add(targetPageVerses.firstVerse.verseKey);
      }
    }

    // Après reveal_last, le dernier verset est aussi visible
    if (state.step === 'reveal_last') {
      if (targetPageVerses?.lastVerse?.verseKey) {
        verses.add(targetPageVerses.lastVerse.verseKey);
      }
    }

    return verses;
  };

  const visibleVerses = getVisibleVerses();

  return {
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
  };
}
