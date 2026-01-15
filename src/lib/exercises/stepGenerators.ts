import type { ExerciseStep, ExerciseConfig, StepGenerator } from '@/types/exercises';
import type { PageVerses, VersePosition } from '@/types';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';

// ============================================
// HELPERS
// ============================================

function createRevealStep(
  verse: VersePosition,
  position: 'first' | 'middle' | 'last' | 'random',
  title: string,
  subtitle: string,
  previousVerses: string[] = []
): ExerciseStep {
  return {
    type: 'revealing',
    targetPosition: position,
    targetVerse: verse,
    message: { title, subtitle },
    ui: {
      isBlurred: false,
      maskAll: true,
      visibleVerses: [...previousVerses, verse.verseKey],
      highlightedVerse: verse.verseKey,
    },
  };
}

function createListeningStep(
  verse: VersePosition,
  position: 'first' | 'middle' | 'last' | 'random',
  title: string,
  subtitle: string
): ExerciseStep {
  return {
    type: 'listening',
    targetPosition: position,
    targetVerse: verse,
    question: 'recite_verse',
    message: { title, subtitle },
    ui: {
      isBlurred: true,
      maskAll: false,
      visibleVerses: [],
    },
  };
}

// ============================================
// 1. RANDOM VERSE (existant - adapté)
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

  // Étape 1: Écoute (flou)
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

  // Étape 2: Révélation du verset récité
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

  // Étape 3: Révélation premier verset
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

  // Étape 4: Révélation dernier verset
  if (lastVerse) {
    steps.push({
      type: 'revealing',
      targetPosition: 'last',
      targetVerse: lastVerse,
      message: {
        title: 'Nouveau tour',
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
// ============================================

export const sequentialStartMiddleEndSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const steps: ExerciseStep[] = [];
  const { firstVerse, lastVerse } = pageVerses;
  const middleVerse = getMiddleVerse(pageVerses);
  const visibleVerses: string[] = [];

  // Premier verset
  if (firstVerse) {
    steps.push(createListeningStep(firstVerse, 'first', 'Écoutez le premier verset...', 'Puis récitez-le'));
    visibleVerses.push(firstVerse.verseKey);
    steps.push(createRevealStep(firstVerse, 'first', 'Premier verset', 'Tapez pour continuer', []));
  }

  // Verset du milieu
  if (middleVerse) {
    steps.push(createListeningStep(middleVerse, 'middle', 'Écoutez le verset du milieu...', 'Puis récitez-le'));
    steps.push(createRevealStep(middleVerse, 'middle', 'Verset du milieu', 'Tapez pour continuer', [...visibleVerses]));
    visibleVerses.push(middleVerse.verseKey);
  }

  // Dernier verset
  if (lastVerse) {
    steps.push(createListeningStep(lastVerse, 'last', 'Écoutez le dernier verset...', 'Puis récitez-le'));
    steps.push(createRevealStep(lastVerse, 'last', 'Dernier verset', 'Page suivante', [...visibleVerses]));
  }

  return steps;
};

// ============================================
// 3. RANDOM START-MIDDLE-END (Quiz sans audio)
// ============================================

export const randomStartMiddleEndSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const steps: ExerciseStep[] = [];
  const { firstVerse, lastVerse } = pageVerses;
  const middleVerse = getMiddleVerse(pageVerses);

  // Créer un tableau des 3 positions et mélanger
  const positions: Array<{ type: 'first' | 'middle' | 'last'; verse: VersePosition | null }> = [
    { type: 'first', verse: firstVerse },
    { type: 'middle', verse: middleVerse },
    { type: 'last', verse: lastVerse },
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

  // Pour chaque position (dans l'ordre mélangé)
  for (const { type, verse } of positions) {
    if (!verse) continue;

    // Étape 1: Afficher le verset (questionner page)
    steps.push({
      type: 'questioning',
      targetPosition: type,
      targetVerse: verse,
      question: 'identify_page',
      message: {
        title: labels[type],
        subtitle: 'Quel numéro de page ?',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [verse.verseKey],
        highlightedVerse: verse.verseKey,
      },
    });

    // Étape 2: Questionner le verset
    steps.push({
      type: 'questioning',
      targetPosition: type,
      targetVerse: verse,
      question: 'identify_verse',
      message: {
        title: labels[type],
        subtitle: 'Quel numéro de verset ?',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [verse.verseKey],
        highlightedVerse: verse.verseKey,
      },
    });
  }

  return steps;
};

// ============================================
// 4-5. START VERSE FORWARD/BACKWARD
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
// ============================================

export const middleVerseForwardSteps: StepGenerator = (
  pageVerses: PageVerses
): ExerciseStep[] => {
  const middleVerse = getMiddleVerse(pageVerses);
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
  pageVerses: PageVerses
): ExerciseStep[] => {
  const middleVerse = getMiddleVerse(pageVerses);
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
