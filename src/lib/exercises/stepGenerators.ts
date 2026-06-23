import type { ExerciseStep, ExerciseConfig, StepGenerator } from '@/types/exercises';
import type { VersePositionType } from '@/types/exercises';
import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap } from '@/hooks/useVerseMap';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';

// ============================================
// HELPERS
// ============================================

const POSITION_ORDER: VersePositionType[] = ['first', 'middle', 'last'];

const POSITION_LABEL: Record<VersePositionType, string> = {
  first: 'Premier verset',
  middle: 'Verset du milieu',
  last: 'Dernier verset',
  random: 'Verset récité',
};

/** Garde uniquement first/middle/last et les ordonne premier→milieu→dernier. */
function orderPositions(positions: VersePositionType[]): VersePositionType[] {
  return POSITION_ORDER.filter((p) => positions.includes(p));
}

/** Récupère le verset correspondant à une position sur la page. */
function getVerseForPosition(
  pageVerses: PageVerses,
  pos: VersePositionType,
  verseMapData?: PageVerseMap | null
): VersePosition | null {
  switch (pos) {
    case 'first':
      return pageVerses.firstVerse;
    case 'last':
      return pageVerses.lastVerse;
    case 'middle':
      return getMiddleVerse(pageVerses, verseMapData);
    case 'random': {
      const { verses } = pageVerses;
      if (verses.length === 0) return null;
      return verses[Math.floor(Math.random() * verses.length)];
    }
    default:
      return null;
  }
}

// ============================================
// QUIZ AUDIO (CHANTIER 1)
// On écoute un verset (premier/milieu/dernier/aléatoire), on le localise,
// puis on révèle au tap les positions choisies (sans audio).
// ============================================

export const audioQuizSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const identify: VersePositionType = config.identifyPosition ?? 'random';
  const revealAfter = orderPositions(config.revealAfter ?? []);

  const identifyVerse = getVerseForPosition(pageVerses, identify, verseMapData);
  if (!identifyVerse) return [];

  const steps: ExerciseStep[] = [];
  const visible: string[] = [];

  // Étape 1 : écoute (audio joué, page floutée)
  steps.push({
    type: 'listening',
    targetPosition: identify,
    targetVerse: identifyVerse,
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

  // Étape 2 : révélation du verset écouté
  visible.push(identifyVerse.verseKey);
  const hasReveal = revealAfter.length > 0;
  steps.push({
    type: 'revealing',
    targetPosition: identify,
    targetVerse: identifyVerse,
    message: {
      title: POSITION_LABEL[identify],
      subtitle: hasReveal ? 'Tapez pour continuer' : 'Double page suivante',
    },
    ui: {
      isBlurred: false,
      maskAll: true,
      visibleVerses: [...visible],
      highlightedVerse: identifyVerse.verseKey,
    },
  });

  // Étapes suivantes : révélation des positions choisies (sans audio)
  const remaining = revealAfter.filter((pos) => {
    const v = getVerseForPosition(pageVerses, pos, verseMapData);
    return v && !visible.includes(v.verseKey);
  });

  remaining.forEach((pos, idx) => {
    const verse = getVerseForPosition(pageVerses, pos, verseMapData);
    if (!verse) return;
    visible.push(verse.verseKey);
    const isLast = idx === remaining.length - 1;
    steps.push({
      type: 'revealing',
      targetPosition: pos,
      targetVerse: verse,
      message: {
        title: POSITION_LABEL[pos],
        subtitle: isLast ? 'Double page suivante' : 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visible],
        highlightedVerse: verse.verseKey,
      },
    });
  });

  return steps;
};

// ============================================
// SÉQUENTIEL (CHANTIER 2)
// Sans audio. On affiche au tap les positions choisies (premier/milieu/dernier),
// dans l'ordre, en progressant page par page selon le sens choisi.
// ============================================

export const sequentialSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const show = orderPositions(config.showPositions ?? []);
  const direction = config.direction ?? 'forward';
  const nextHint =
    direction === 'backward' ? '← Tapez pour page précédente' : 'Tapez pour page suivante →';

  const chosen = show
    .map((pos) => ({ pos, verse: getVerseForPosition(pageVerses, pos, verseMapData) }))
    .filter((x): x is { pos: VersePositionType; verse: VersePosition } => x.verse !== null);

  const steps: ExerciseStep[] = [];
  const visible: string[] = [];

  chosen.forEach(({ pos, verse }, idx) => {
    if (visible.includes(verse.verseKey)) return;
    visible.push(verse.verseKey);
    const isLast = idx === chosen.length - 1;
    steps.push({
      type: 'revealing',
      targetPosition: pos,
      targetVerse: verse,
      question: 'recite_verse',
      message: {
        title: POSITION_LABEL[pos],
        subtitle: isLast ? nextHint : 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visible],
        highlightedVerse: verse.verseKey,
      },
    });
  });

  return steps;
};

// ============================================
// HIFZ
// Double page affichée, l'utilisateur choisit son niveau de masquage (0-8)
// et feuillette la plage avec les boutons gauche/droite.
// ============================================

export const hifzSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  _config: ExerciseConfig
): ExerciseStep[] => {
  return [
    {
      type: 'revealing',
      message: {
        title: 'Hifz',
        subtitle: 'Choisis le niveau de masquage',
      },
      ui: {
        isBlurred: false,
        maskAll: false,
        visibleVerses: pageVerses.verses.map((v) => v.verseKey),
        singlePage: false,
        hifzLevel: 0,
      },
    },
  ];
};

// ============================================
// MAPPING EXERCICE → GÉNÉRATEUR
// ============================================

import type { ExerciseId } from '@/types/exercises';

export const STEP_GENERATORS: Record<ExerciseId, StepGenerator> = {
  'audio-quiz': audioQuizSteps,
  sequential: sequentialSteps,
  hifz: hifzSteps,
};
