import type { VersePosition, PageVerses, QuizConfig } from './index';

// ============================================
// EXERCISE IDENTIFIERS
// ============================================

export type ExerciseId =
  | 'audio-quiz'
  | 'sequential'
  | 'hifz'
  | 'recitation'
  | 'page-number';

// ============================================
// EXERCISE ENUMS
// ============================================

/** Position du verset sur la page ('previous' = le verset juste avant celui identifié) */
export type VersePositionType = 'first' | 'middle' | 'last' | 'random' | 'previous';

/** Mode de réponse aux questions du quiz : taper l'écran ou réciter au micro. */
export type AnswerMode = 'tap' | 'recite';

/** Direction de progression */
export type ProgressionDirection = 'forward' | 'backward' | 'random';

/** Catégorie d'exercice */
export type ExerciseCategory = 'random' | 'sequential' | 'positional' | 'recitation';

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
  /** Si true, n'affiche qu'une seule page (pas double page). */
  singlePage?: boolean;
  /** Niveau Hifz par défaut (0-8). */
  hifzLevel?: number;
  /** Fraction du verset révélée en sixièmes (1-6). Absent ou 6 = verset complet. */
  revealFraction?: number;
  /** Si true, l'étape attend une récitation au micro avant de révéler. */
  awaitsRecitation?: boolean;
  /**
   * Page dont la double page doit être affichée pendant cette étape (au lieu de
   * la page du tour) — ex. verset précédent situé sur la double page d'avant.
   */
  displayPage?: number;
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
  /** Nombre de questions (tours) souhaité. Absent = toute la plage. */
  maxRounds?: number;
  /** Quiz audio : position du verset joué à l'audio à identifier. */
  identifyPosition?: VersePositionType;
  /** Quiz audio : positions à révéler ensuite (sans audio), ordre précédent→premier→milieu→dernier. */
  revealAfter?: VersePositionType[];
  /** Quiz audio : durée max (en secondes) de l'extrait audio de la question. Absent/0 = verset complet. */
  audioSeconds?: number;
  /** Quiz audio : fraction du verset révélée en sixièmes (1-6). Absent ou 6 = complet. */
  revealFraction?: number;
  /** Quiz audio : mode de réponse aux questions (taper l'écran ou réciter au micro). */
  answerMode?: AnswerMode;
  /**
   * Quiz audio (mode « taper l'écran ») : temps autorisé en secondes avant la
   * révélation automatique du verset. Absent/0 = sans limite (révélation au tap).
   */
  revealTimeout?: number;
  /** Séquentiel : positions de versets à afficher, ordre premier→milieu→dernier. */
  showPositions?: VersePositionType[];
  /** Séquentiel : sens de progression dans la plage. */
  direction?: 'forward' | 'backward';
}

// ============================================
// STEP GENERATOR
// ============================================

import type { PageVerseMap } from '@/hooks/useVerseMap';

export type StepGenerator = (
  pageVerses: PageVerses,
  pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
) => ExerciseStep[];
