// Types du domaine « Récitation adaptative » (programme + cycle + sessions).
// Le moteur (perimeter/planner/schedule/mastery) est PUR : aucune I/O, aucune
// lecture d'horloge — les données Coran et les dates sont passées en paramètre.

// ---------------------------------------------------------------------------
// Périmètre mémorisé
// ---------------------------------------------------------------------------

/** Une sélection déclarée par l'utilisateur (cumulables, dédupliquées en pages). */
export type MemorizedSelection =
  | { kind: 'surah-range'; fromSurah: number; toSurah: number }
  | { kind: 'surah'; surah: number }
  | { kind: 'juz'; juz: number }
  | { kind: 'page-range'; fromPage: number; toPage: number }
  | { kind: 'page'; page: number };

/** Résumé affiché avant validation du périmètre. */
export interface PerimeterSummary {
  totalPages: number;
  firstPage: number | null;
  lastPage: number | null;
  /** Sourates dont au moins une page est couverte. */
  surahs: number[];
  /** Juz' dont au moins une page est couverte. */
  juzs: number[];
  /** Juz' entièrement couverts. */
  completeJuzs: number[];
}

// ---------------------------------------------------------------------------
// Objectif et cycle
// ---------------------------------------------------------------------------

/** Objectif de récitation choisi (construit le cycle). */
export type Objective =
  /** n juz' par jour (0.5 = un hizb) : découpe aux frontières réelles du mushaf. */
  | { kind: 'juzPerDay'; amount: 0.5 | 1 | 2 }
  /** n pages par jour : jours remplis à la cible, dernier jour plus court. */
  | { kind: 'pagesPerDay'; pages: number }
  /** Terminer tout le périmètre en n jours : répartition équilibrée. */
  | { kind: 'totalDays'; days: number };

/** Un jour du cycle : pages à réciter (ordre du mushaf). */
export interface CycleDay {
  /** Index 0-based dans le cycle. */
  index: number;
  pages: number[];
}

/** Cycle construit à partir du périmètre + objectif. */
export interface Cycle {
  days: CycleDay[];
  /** Numéro du cycle depuis la création du programme (1-based). */
  number: number;
  /** Date (YYYY-MM-DD) du premier jour du cycle. */
  startDate: string;
}

// ---------------------------------------------------------------------------
// Jours et horaires
// ---------------------------------------------------------------------------

/** Plage horaire d'une journée, en minutes depuis minuit. */
export interface DayHours {
  startMin: number; // ex. 480  (8 h)
  endMin: number;   // ex. 1200 (20 h)
  /** Espacement des créneaux en minutes ; null = créneaux saisis manuellement. */
  frequencyMin: number | null;
  /** Créneaux manuels (utilisés si frequencyMin est null). */
  manualSlots?: Slot[];
}

export interface ScheduleConfig {
  /** Jours actifs, convention JS Date.getDay() : 0 = dimanche … 6 = samedi. */
  activeWeekdays: number[];
  /** Horaires par défaut. */
  hours: DayHours;
  /** Horaires spécifiques par jour de semaine (prioritaires sur hours). */
  overrides?: Partial<Record<number, DayHours>>;
  remindersEnabled: boolean;
}

/** Un créneau horaire (minutes depuis minuit). */
export interface Slot {
  startMin: number;
  endMin: number;
}

/** Un créneau planifié avec ses pages du jour. */
export interface PlannedSlot extends Slot {
  pages: number[];
}

// ---------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------

/** Comportement préféré quand un créneau se termine incomplet. */
export type CarryOverMode = 'auto' | 'never' | 'ask';

export interface Program {
  selections: MemorizedSelection[];
  /** Pages dédupliquées et triées (dérivé des sélections, figé à l'enregistrement). */
  perimeterPages: number[];
  objective: Objective;
  schedule: ScheduleConfig;
  /** Répartition du jour entre créneaux : auto (équilibrée) ou pages fixées par créneau. */
  slotSplit: { mode: 'auto' } | { mode: 'custom'; pagesPerSlot: number[] };
  carryOver: CarryOverMode;
  reinforcementEnabled: boolean;
  /** Rappel avant la fin d'un créneau, en minutes (null = désactivé). */
  endReminderMin: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Sessions et évaluations
// ---------------------------------------------------------------------------

export type MasteryLevel = 'maitrisee' | 'plutot-maitrisee' | 'fragile' | 'a-retravailler';

/** Évaluation d'une page après récitation (historique en append, jamais purgé). */
export interface PageEvaluation {
  page: number;
  level: MasteryLevel;
  note?: string;
  /** ISO — horodatage de l'évaluation. */
  at: string;
}

export type SessionStatus = 'done' | 'partial' | 'missed';

/** Trace d'un créneau réalisé (ou non) — historique en append. */
export interface SessionRecord {
  date: string; // YYYY-MM-DD
  slot: Slot;
  plannedPages: number[];
  recitedPages: number[];
  status: SessionStatus;
  /** Pages reportées vers le créneau suivant (sous-ensemble des non-récitées). */
  carriedOver: number[];
}

/** État vivant de la journée en cours (widget, écran verrouillé, reprise). */
export interface DayState {
  date: string; // YYYY-MM-DD
  /** Index du jour dans le cycle. */
  cycleDayIndex: number;
  slots: PlannedSlot[];
  /** Pages déjà récitées aujourd'hui (tous créneaux confondus). */
  recitedPages: number[];
  /** Pages en attente d'évaluation (« évaluer plus tard »). */
  pendingEvaluations: number[];
}
