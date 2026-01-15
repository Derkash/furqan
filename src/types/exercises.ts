import type { VersePosition, PageVerses, QuizConfig } from './index';

// ============================================
// EXERCISE IDENTIFIERS
// ============================================

export type ExerciseId =
  | 'random-verse'
  | 'sequential-start-middle-end'
  | 'random-start-middle-end'
  | 'start-verse-forward'
  | 'start-verse-backward'
  | 'middle-verse-forward'
  | 'middle-verse-backward'
  | 'end-verse-forward'
  | 'end-verse-backward';

// ============================================
// EXERCISE ENUMS
// ============================================

/** Position du verset sur la page */
export type VersePositionType = 'first' | 'middle' | 'last' | 'random';

/** Direction de progression */
export type ProgressionDirection = 'forward' | 'backward' | 'random';

/** Catégorie d'exercice */
export type ExerciseCategory = 'random' | 'sequential' | 'positional';

/** Types de questions */
export type QuestionType =
  | 'recite_verse'
  | 'identify_page'
  | 'identify_verse'
  | 'locate_verse'
  | 'none';

// ============================================
// EXERCISE DEFINITION
// ============================================

export interface ExerciseDefinition {
  id: ExerciseId;
  name: string;
  nameArabic: string;
  description: string;
  category: ExerciseCategory;
  hasAudio: boolean;
  progression: ProgressionDirection;
  versePositions: VersePositionType[];
  questions: QuestionType[];
  icon: string;
  difficulty: number;
}

// ============================================
// EXERCISE STEP & ROUND
// ============================================

export type ExerciseStepType =
  | 'listening'
  | 'questioning'
  | 'revealing'
  | 'transitioning'
  | 'completed';

export interface ExerciseStepUI {
  isBlurred: boolean;
  maskAll: boolean;
  visibleVerses: string[];
  highlightedVerse?: string;
}

export interface ExerciseStep {
  type: ExerciseStepType;
  targetPosition?: VersePositionType;
  targetVerse?: VersePosition;
  question?: QuestionType;
  message: {
    title: string;
    subtitle: string;
  };
  ui: ExerciseStepUI;
}

export interface ExerciseRound {
  roundIndex: number;
  totalRounds: number;
  pageNumber: number;
  steps: ExerciseStep[];
  currentStepIndex: number;
}

// ============================================
// EXERCISE STATE
// ============================================

export interface ExerciseProgress {
  currentPage: number;
  pagesCompleted: number;
  totalPages: number;
  roundsCompleted: number;
  totalRounds: number;
}

export type ExerciseStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface ExerciseState {
  exerciseId: ExerciseId;
  config: ExerciseConfig;
  currentRound: ExerciseRound | null;
  progress: ExerciseProgress;
  status: ExerciseStatus;
}

// ============================================
// EXERCISE CONFIG
// ============================================

export interface ExerciseConfig extends QuizConfig {
  exerciseId: ExerciseId;
}

// ============================================
// STEP GENERATOR
// ============================================

export type StepGenerator = (
  pageVerses: PageVerses,
  pageNumber: number,
  config: ExerciseConfig
) => ExerciseStep[];
