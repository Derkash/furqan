import type { ExerciseDefinition, ExerciseId, StepGenerator } from '@/types/exercises';

export interface RegisteredExercise {
  definition: ExerciseDefinition;
  generateSteps: StepGenerator;
}

const EXERCISE_REGISTRY = new Map<ExerciseId, RegisteredExercise>();

// ============================================
// DÉFINITIONS DES EXERCICES
// ============================================

export const EXERCISES: ExerciseDefinition[] = [
  {
    id: 'lecture',
    name: 'Lecture',
    nameArabic: 'تلاوة وقراءة',
    description:
      'Lis le Mushaf sur la plage choisie, écoute la récitation (vitesse réglable), et vois surlignés tous les mots dont la racine est dans ton lexique',
    category: 'sequential',
    hasAudio: true,
    progression: 'forward',
    versePositions: ['first'],
    questions: ['none'],
    icon: 'book',
    difficulty: 1,
  },
  {
    id: 'audio-quiz',
    name: 'Quiz audio',
    nameArabic: 'اختبار صوتي',
    description:
      'Écoutez un verset (premier, milieu, dernier ou aléatoire), localisez-le, puis découvrez les versets de votre choix',
    category: 'random',
    hasAudio: true,
    progression: 'random',
    versePositions: ['random', 'first', 'middle', 'last'],
    questions: ['locate_verse'],
    icon: 'ear',
    difficulty: 3,
  },
  {
    id: 'sequential',
    name: 'Séquentiel',
    nameArabic: 'متتابع',
    description:
      'Choisissez les versets à afficher (premier, milieu, dernier) et le sens de progression dans la plage',
    category: 'sequential',
    hasAudio: false,
    progression: 'forward',
    versePositions: ['first', 'middle', 'last'],
    questions: ['recite_verse'],
    icon: 'list',
    difficulty: 2,
  },
  {
    id: 'recitation',
    name: 'Récitation',
    nameArabic: 'تلاوة',
    description:
      'Écoutez 9 s d’un verset aléatoire, enregistrez votre récitation, puis comparez (page révélée, verset surligné). Déclarez vos fautes mot par mot : elles orientent les prochaines questions',
    category: 'recitation',
    hasAudio: true,
    progression: 'random',
    versePositions: ['random'],
    questions: ['recite_verse'],
    icon: 'mic',
    difficulty: 5,
  },
  {
    id: 'page-number',
    name: 'Numéro de page',
    nameArabic: 'رقم الصفحة',
    description:
      'On vous demande une page d’une sourate (« la 12ᵉ page d’Al-Baqarah »). Retrouvez-la, puis dévoilez au tap le premier verset, celui du milieu, puis le dernier',
    category: 'sequential',
    hasAudio: false,
    progression: 'random',
    versePositions: ['first', 'middle', 'last'],
    questions: ['identify_page'],
    icon: 'help-circle',
    difficulty: 4,
  },
  {
    id: 'verse-start',
    name: 'Début verset',
    nameArabic: 'بداية الآية',
    description:
      'Seul le début (1/6) d’un verset est dévoilé sur la double page : récitez la suite, puis tapez pour révéler le verset entier',
    category: 'random',
    hasAudio: false,
    progression: 'random',
    versePositions: ['random'],
    questions: ['recite_verse'],
    icon: 'pencil',
    difficulty: 4,
  },
  {
    id: 'guess',
    name: 'Devine',
    nameArabic: 'خَمِّن',
    description:
      'Deux jeux : « Quel verset ? » — une page s’affiche avec un verset masqué, à toi de le retrouver ; « Quelle page ? » — tout le texte est masqué, seuls les séparateurs de versets restent (celui du milieu en rouge) et le numéro de page est caché',
    category: 'random',
    hasAudio: false,
    progression: 'random',
    versePositions: ['random', 'middle'],
    questions: ['identify_verse', 'identify_page'],
    icon: 'help-circle',
    difficulty: 4,
  },
  {
    id: 'hifz',
    name: 'Hifz',
    nameArabic: 'حفظ',
    description: '8 niveaux de masquage progressif, en double page, sur la plage choisie',
    category: 'positional',
    hasAudio: false,
    progression: 'forward',
    versePositions: ['first'],
    questions: ['recite_verse'],
    icon: 'brain',
    difficulty: 4,
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
