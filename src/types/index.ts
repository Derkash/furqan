// Position d'un verset sur une page
export interface VersePosition {
  verseKey: string; // "4:15"
  surah: number;
  verse: number;
  page: number;
  lines: number[]; // [3, 4] si le verset occupe les lignes 3 et 4
  globalNumber: number;
}

// Données des versets d'une page
export interface PageVerses {
  page: number;
  verses: VersePosition[];
  firstVerse: VersePosition | null;
  lastVerse: VersePosition | null;
}

// Types pour le quiz
export type QuizStep =
  | 'config'
  | 'listening' // Audio joue, tout masqué
  | 'reveal_recited' // Verset récité visible
  | 'ask_first' // Question 1er verset
  | 'reveal_first' // 1er verset visible
  | 'ask_last' // Question dernier verset
  | 'reveal_last'; // Dernier verset visible

export interface QuizConfig {
  startPage: number;
  endPage: number;
}

export interface QuizState {
  step: QuizStep;
  config: QuizConfig;
  targetVerse: VersePosition | null;
  currentPage: number;
  revealedVerses: Set<string>; // verseKeys révélés
}

// Types pour l'audio
export interface AudioState {
  isPlaying: boolean;
  isLoading: boolean;
  currentVerse: VersePosition | null;
  error: string | null;
}

// Type obsolète - conservé temporairement pour compatibilité
export interface Verse {
  surah: number;
  verse: number;
  globalNumber: number;
  page: number;
  text: string;
  audioUrl: string;
}

// Type obsolète - conservé temporairement pour compatibilité
export interface MushafPage {
  page: number;
  lines: MushafLayoutLine[];
}

// Types pour l'orientation
export type Orientation = 'portrait' | 'landscape';

// Paire de pages (droite, gauche en RTL)
export interface PagePair {
  rightPage: number; // Page impaire
  leftPage: number; // Page paire
}

// Structure du JSON de layout (depuis zonetecde/mushaf-layout)
export interface MushafLayoutLine {
  line: number;
  type: 'surah-header' | 'basmala' | 'text';
  text?: string;
  surah?: string;
  verseRange?: string;
  words?: MushafLayoutWord[];
}

export interface MushafLayoutWord {
  location: string; // "4:15:3" = sourate:verset:position
  word: string;
  qpcV1?: string;
  qpcV2?: string;
}

export interface MushafLayoutPage {
  page: number;
  lines: MushafLayoutLine[];
}
