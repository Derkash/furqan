import type { ExerciseStep, ExerciseConfig, StepGenerator } from '@/types/exercises';
import type { VersePositionType } from '@/types/exercises';
import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap } from '@/hooks/useVerseMap';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';
import { fromGlobalAyahNumber, getVerseKey } from '@/utils/ayahMapping';

// ============================================
// HELPERS
// ============================================

const POSITION_ORDER: VersePositionType[] = ['previous', 'first', 'middle', 'last'];

const POSITION_LABEL: Record<VersePositionType, string> = {
  first: 'Premier verset',
  middle: 'Verset du milieu',
  last: 'Dernier verset',
  random: 'Verset récité',
  previous: 'Verset précédent',
};

const POSITION_QUESTION: Record<VersePositionType, string> = {
  first: 'Récitez le PREMIER verset de la page',
  middle: 'Récitez le verset du MILIEU de la page',
  last: 'Récitez le DERNIER verset de la page',
  random: 'Récitez le verset',
  previous: 'Récitez le verset PRÉCÉDENT (juste avant le verset écouté)',
};

/** Garde uniquement les positions révélables et les ordonne précédent→premier→milieu→dernier. */
function orderPositions(positions: VersePositionType[]): VersePositionType[] {
  return POSITION_ORDER.filter((p) => positions.includes(p));
}

/**
 * Verset précédant `verse` dans l'ordre du Mushaf (numéro global - 1).
 * S'il est sur la page affichée on a sa position exacte, sinon on construit
 * une position minimale (suffisante pour le masquage par clé et l'audio).
 */
function getPreviousVerse(verse: VersePosition, pageVerses: PageVerses): VersePosition | null {
  const prevGlobal = verse.globalNumber - 1;
  if (prevGlobal < 1) return null;
  const onPage = pageVerses.verses.find((v) => v.globalNumber === prevGlobal);
  if (onPage) return onPage;
  const { surah, verse: verseNum } = fromGlobalAyahNumber(prevGlobal);
  return {
    verseKey: getVerseKey(surah, verseNum),
    surah,
    verse: verseNum,
    page: verse.page,
    lines: [],
    globalNumber: prevGlobal,
  };
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
  // Fraction révélée (1-6) : 6 ou absent = complet → pas de masquage partiel.
  const fraction =
    config.revealFraction && config.revealFraction >= 1 && config.revealFraction < 6
      ? config.revealFraction
      : undefined;
  const recite = config.answerMode === 'recite';

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
      subtitle: 'Où se trouve-t-il ? Tapez quand vous avez trouvé',
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
      revealFraction: fraction,
    },
  });

  // Étapes suivantes : pour chaque position choisie, une QUESTION (affichée en
  // grand sur la page opposée ; réponse au tap ou par récitation au micro),
  // puis la RÉVÉLATION du verset.
  const remaining = revealAfter
    .map((pos) => ({
      pos,
      verse:
        pos === 'previous'
          ? getPreviousVerse(identifyVerse, pageVerses)
          : getVerseForPosition(pageVerses, pos, verseMapData),
    }))
    .filter(
      (x): x is { pos: VersePositionType; verse: VersePosition } =>
        x.verse !== null && !visible.includes(x.verse.verseKey)
    );

  remaining.forEach(({ pos, verse }, idx) => {
    // Question : les versets déjà révélés restent visibles, la cible reste masquée.
    steps.push({
      type: 'questioning',
      targetPosition: pos,
      targetVerse: verse,
      question: 'recite_verse',
      message: {
        title: POSITION_QUESTION[pos],
        subtitle: recite
          ? 'Enregistrez votre récitation — la fin de l’enregistrement révèle le verset'
          : 'Tapez pour révéler',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visible],
        revealFraction: fraction,
        awaitsRecitation: recite,
      },
    });

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
        revealFraction: fraction,
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
  // La récitation n'utilise pas la machine à états Mushaf : interface dédiée
  // (RecitationPractice) ; ce générateur ne sert jamais.
  recitation: () => [],
};
