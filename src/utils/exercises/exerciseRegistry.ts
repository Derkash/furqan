import type { ExerciseDefinition, ExerciseId, StepGenerator } from '@/types/exercises';

export interface RegisteredExercise {
  definition: ExerciseDefinition;
  generateSteps: StepGenerator;
}

const EXERCISE_REGISTRY = new Map<ExerciseId, RegisteredExercise>();

// ============================================
// DÉFINITIONS DES 9 EXERCICES
// ============================================

export const EXERCISES: ExerciseDefinition[] = [
  {
    id: 'random-verse',
    name: 'Verset aléatoire',
    nameArabic: 'آية عشوائية',
    description: 'Écoutez un verset aléatoire, puis révélez premier et dernier verset',
    category: 'random',
    hasAudio: true,
    progression: 'random',
    versePositions: ['random', 'first', 'last'],
    questions: ['locate_verse', 'recite_verse'],
    icon: 'shuffle',
    difficulty: 2,
  },
  {
    id: 'sequential-start-middle-end',
    name: 'Début-Milieu-Fin (séquentiel)',
    nameArabic: 'أول-وسط-آخر متتابع',
    description: 'Pour chaque page : premier, milieu, puis dernier verset',
    category: 'sequential',
    hasAudio: true,
    progression: 'forward',
    versePositions: ['first', 'middle', 'last'],
    questions: ['recite_verse'],
    icon: 'list',
    difficulty: 3,
  },
  {
    id: 'random-start-middle-end',
    name: 'Quiz Début-Milieu-Fin',
    nameArabic: 'اختبار أول-وسط-آخر',
    description: 'Écoutez le premier verset, puis identifiez page et verset',
    category: 'random',
    hasAudio: true,
    progression: 'forward',
    versePositions: ['first', 'middle', 'last'],
    questions: ['identify_page', 'identify_verse'],
    icon: 'help-circle',
    difficulty: 4,
  },
  {
    id: 'start-verse-forward',
    name: 'Premier verset →',
    nameArabic: 'أول آية ←',
    description: 'Affichez le premier verset, progressez vers la fin',
    category: 'positional',
    hasAudio: false,
    progression: 'forward',
    versePositions: ['first'],
    questions: ['recite_verse'],
    icon: 'arrow-right',
    difficulty: 1,
  },
  {
    id: 'start-verse-backward',
    name: 'Premier verset ←',
    nameArabic: 'أول آية →',
    description: 'Affichez le premier verset, progressez vers le début',
    category: 'positional',
    hasAudio: false,
    progression: 'backward',
    versePositions: ['first'],
    questions: ['recite_verse'],
    icon: 'arrow-left',
    difficulty: 2,
  },
  {
    id: 'middle-verse-forward',
    name: 'Verset du milieu →',
    nameArabic: 'آية الوسط ←',
    description: 'Affichez le verset du milieu, progressez vers la fin',
    category: 'positional',
    hasAudio: false,
    progression: 'forward',
    versePositions: ['middle'],
    questions: ['recite_verse'],
    icon: 'arrow-right',
    difficulty: 2,
  },
  {
    id: 'middle-verse-backward',
    name: 'Verset du milieu ←',
    nameArabic: 'آية الوسط →',
    description: 'Affichez le verset du milieu, progressez vers le début',
    category: 'positional',
    hasAudio: false,
    progression: 'backward',
    versePositions: ['middle'],
    questions: ['recite_verse'],
    icon: 'arrow-left',
    difficulty: 3,
  },
  {
    id: 'end-verse-forward',
    name: 'Dernier verset →',
    nameArabic: 'آخر آية ←',
    description: 'Affichez le dernier verset, progressez vers la fin',
    category: 'positional',
    hasAudio: false,
    progression: 'forward',
    versePositions: ['last'],
    questions: ['recite_verse'],
    icon: 'arrow-right',
    difficulty: 2,
  },
  {
    id: 'end-verse-backward',
    name: 'Dernier verset ←',
    nameArabic: 'آخر آية →',
    description: 'Affichez le dernier verset, progressez vers le début',
    category: 'positional',
    hasAudio: false,
    progression: 'backward',
    versePositions: ['last'],
    questions: ['recite_verse'],
    icon: 'arrow-left',
    difficulty: 3,
  },
];

// ============================================
// FONCTIONS DU REGISTRE
// ============================================

export function registerExercise(
  definition: ExerciseDefinition,
  generateSteps: StepGenerator
): void {
  EXERCISE_REGISTRY.set(definition.id, { definition, generateSteps });
}

export function getExercise(id: ExerciseId): RegisteredExercise | undefined {
  return EXERCISE_REGISTRY.get(id);
}

export function getExerciseDefinition(id: ExerciseId): ExerciseDefinition | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function getAllExercises(): ExerciseDefinition[] {
  return EXERCISES;
}

export function getExercisesByCategory(category: string): ExerciseDefinition[] {
  return EXERCISES.filter((e) => e.category === category);
}

export function isValidExerciseId(id: string): id is ExerciseId {
  return EXERCISES.some((e) => e.id === id);
}
