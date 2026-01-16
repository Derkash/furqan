import type { ExerciseStep, ExerciseConfig, StepGenerator } from '@/types/exercises';
import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap } from '@/hooks/useVerseMap';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';

// ============================================
// 1. RANDOM VERSE
// Audio SEULEMENT pour la première étape (découverte)
// ============================================

export const randomVerseSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig
): ExerciseStep[] => {
  const steps: ExerciseStep[] = [];
  const { firstVerse, lastVerse, verses } = pageVerses;

  // Sélectionner un verset aléatoire
  const randomIndex = Math.floor(Math.random() * verses.length);
  const targetVerse = verses[randomIndex];

  if (!targetVerse) return steps;

  // Étape 1: Écoute du verset aléatoire (SEULE étape avec audio)
  steps.push({
    type: 'listening',
    targetPosition: 'random',
    targetVerse,
    question: 'locate_verse',
    message: {
      title: 'Écoutez le verset...',
      subtitle: 'Où se trouve-t-il ?',
    },
    ui: {
      isBlurred: true,
      maskAll: false,
      visibleVerses: [],
    },
  });

  // Étape 2: Révélation du verset récité (PAS d'audio)
  steps.push({
    type: 'revealing',
    targetPosition: 'random',
    targetVerse,
    message: {
      title: 'Récitez le premier verset',
      subtitle: 'de cette page',
    },
    ui: {
      isBlurred: false,
      maskAll: true,
      visibleVerses: [targetVerse.verseKey],
      highlightedVerse: targetVerse.verseKey,
    },
  });

  // Étape 3: Révélation premier verset (PAS d'audio)
  if (firstVerse) {
    steps.push({
      type: 'revealing',
      targetPosition: 'first',
      targetVerse: firstVerse,
      message: {
        title: 'Récitez le dernier verset',
        subtitle: 'de cette page',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [targetVerse.verseKey, firstVerse.verseKey],
        highlightedVerse: firstVerse.verseKey,
      },
    });
  }

  // Étape 4: Révélation dernier verset (PAS d'audio)
  if (lastVerse) {
    steps.push({
      type: 'revealing',
      targetPosition: 'last',
      targetVerse: lastVerse,
      message: {
        title: 'Page suivante',
        subtitle: 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [
          targetVerse.verseKey,
          firstVerse?.verseKey || '',
          lastVerse.verseKey,
        ].filter(Boolean),
        highlightedVerse: lastVerse.verseKey,
      },
    });
  }

  return steps;
};

// ============================================
// 2. SEQUENTIAL START-MIDDLE-END
// Audio pour la première étape (écoute), puis révéler les versets un par un
// ============================================

export const sequentialStartMiddleEndSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const steps: ExerciseStep[] = [];
  const { firstVerse, lastVerse } = pageVerses;
  const middleVerse = getMiddleVerse(pageVerses, verseMapData);
  const visibleVerses: string[] = [];

  // Étape 1: Écoute du premier verset (avec audio et flou)
  if (firstVerse) {
    steps.push({
      type: 'listening',
      targetPosition: 'first',
      targetVerse: firstVerse,
      question: 'locate_verse',
      message: {
        title: 'Écoutez le premier verset...',
        subtitle: 'Où se trouve-t-il ?',
      },
      ui: {
        isBlurred: true,
        maskAll: false,
        visibleVerses: [],
      },
    });

    // Étape 2: Révélation du premier verset
    visibleVerses.push(firstVerse.verseKey);
    steps.push({
      type: 'revealing',
      targetPosition: 'first',
      targetVerse: firstVerse,
      message: {
        title: 'Premier verset',
        subtitle: 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visibleVerses],
        highlightedVerse: firstVerse.verseKey,
      },
    });
  }

  // Verset du milieu - juste révéler (pas d'audio)
  if (middleVerse) {
    visibleVerses.push(middleVerse.verseKey);
    steps.push({
      type: 'revealing',
      targetPosition: 'middle',
      targetVerse: middleVerse,
      message: {
        title: 'Verset du milieu',
        subtitle: 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visibleVerses],
        highlightedVerse: middleVerse.verseKey,
      },
    });
  }

  // Dernier verset - juste révéler (pas d'audio)
  if (lastVerse) {
    visibleVerses.push(lastVerse.verseKey);
    steps.push({
      type: 'revealing',
      targetPosition: 'last',
      targetVerse: lastVerse,
      message: {
        title: 'Dernier verset',
        subtitle: 'Page suivante',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visibleVerses],
        highlightedVerse: lastVerse.verseKey,
      },
    });
  }

  return steps;
};

// ============================================
// 3. RANDOM START-MIDDLE-END (Quiz sans audio)
// Une seule étape par verset, garde les versets précédents visibles
// ============================================

export const randomStartMiddleEndSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const steps: ExerciseStep[] = [];
  const { firstVerse, lastVerse } = pageVerses;
  const middleVerse = getMiddleVerse(pageVerses, verseMapData);

  // Créer un tableau des 3 positions et mélanger
  const positions: Array<{ type: 'first' | 'middle' | 'last'; verse: VersePosition | null }> = [
    { type: 'first' as const, verse: firstVerse },
    { type: 'middle' as const, verse: middleVerse },
    { type: 'last' as const, verse: lastVerse },
  ].filter((p) => p.verse !== null);

  // Mélanger (Fisher-Yates)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const labels = {
    first: 'Premier verset',
    middle: 'Verset du milieu',
    last: 'Dernier verset',
  };

  // Accumuler les versets visibles
  const visibleVerses: string[] = [];

  // Une seule étape par verset (page + verset combinés)
  for (const { type, verse } of positions) {
    if (!verse) continue;

    visibleVerses.push(verse.verseKey);

    steps.push({
      type: 'questioning',
      targetPosition: type,
      targetVerse: verse,
      question: 'identify_page',
      message: {
        title: labels[type],
        subtitle: 'Page ? Verset ?',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visibleVerses],
        highlightedVerse: verse.verseKey,
      },
    });
  }

  return steps;
};

// ============================================
// 4-5. START VERSE FORWARD/BACKWARD
// Masquer tout sauf le verset cible (les versets de la double page s'accumulent via le hook)
// ============================================

export const startVerseForwardSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const { firstVerse } = pageVerses;
  if (!firstVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'first',
      targetVerse: firstVerse,
      question: 'recite_verse',
      message: {
        title: 'Premier verset',
        subtitle: 'Tapez pour page suivante →',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [firstVerse.verseKey],
        highlightedVerse: firstVerse.verseKey,
      },
    },
  ];
};

export const startVerseBackwardSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const { firstVerse } = pageVerses;
  if (!firstVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'first',
      targetVerse: firstVerse,
      question: 'recite_verse',
      message: {
        title: 'Premier verset',
        subtitle: '← Tapez pour page précédente',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [firstVerse.verseKey],
        highlightedVerse: firstVerse.verseKey,
      },
    },
  ];
};

// ============================================
// 6-7. MIDDLE VERSE FORWARD/BACKWARD
// Masquer tout sauf le verset cible (les versets de la double page s'accumulent via le hook)
// ============================================

export const middleVerseForwardSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const middleVerse = getMiddleVerse(pageVerses, verseMapData);
  if (!middleVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'middle',
      targetVerse: middleVerse,
      question: 'recite_verse',
      message: {
        title: 'Verset du milieu',
        subtitle: 'Tapez pour page suivante →',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [middleVerse.verseKey],
        highlightedVerse: middleVerse.verseKey,
      },
    },
  ];
};

export const middleVerseBackwardSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const middleVerse = getMiddleVerse(pageVerses, verseMapData);
  if (!middleVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'middle',
      targetVerse: middleVerse,
      question: 'recite_verse',
      message: {
        title: 'Verset du milieu',
        subtitle: '← Tapez pour page précédente',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [middleVerse.verseKey],
        highlightedVerse: middleVerse.verseKey,
      },
    },
  ];
};

// ============================================
// 8-9. END VERSE FORWARD/BACKWARD
// Masquer tout sauf le verset cible (les versets de la double page s'accumulent via le hook)
// ============================================

export const endVerseForwardSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const { lastVerse } = pageVerses;
  if (!lastVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'last',
      targetVerse: lastVerse,
      question: 'recite_verse',
      message: {
        title: 'Dernier verset',
        subtitle: 'Tapez pour page suivante →',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [lastVerse.verseKey],
        highlightedVerse: lastVerse.verseKey,
      },
    },
  ];
};

export const endVerseBackwardSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const { lastVerse } = pageVerses;
  if (!lastVerse) return [];

  return [
    {
      type: 'revealing',
      targetPosition: 'last',
      targetVerse: lastVerse,
      question: 'recite_verse',
      message: {
        title: 'Dernier verset',
        subtitle: '← Tapez pour page précédente',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [lastVerse.verseKey],
        highlightedVerse: lastVerse.verseKey,
      },
    },
  ];
};

// ============================================
// MAPPING EXERCICE → GÉNÉRATEUR
// ============================================

import type { ExerciseId } from '@/types/exercises';

export const STEP_GENERATORS: Record<ExerciseId, StepGenerator> = {
  'random-verse': randomVerseSteps,
  'sequential-start-middle-end': sequentialStartMiddleEndSteps,
  'random-start-middle-end': randomStartMiddleEndSteps,
  'start-verse-forward': startVerseForwardSteps,
  'start-verse-backward': startVerseBackwardSteps,
  'middle-verse-forward': middleVerseForwardSteps,
  'middle-verse-backward': middleVerseBackwardSteps,
  'end-verse-forward': endVerseForwardSteps,
  'end-verse-backward': endVerseBackwardSteps,
};
