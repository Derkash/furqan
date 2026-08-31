import type { ExerciseStep, ExerciseConfig, StepGenerator } from '@/types/exercises';
import type { VersePositionType } from '@/types/exercises';
import type { PageVerses, VersePosition } from '@/types';
import type { PageVerseMap } from '@/hooks/useVerseMap';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';
import { getSurahPageInfo } from '@/utils/exercises/surahPages';
import { fromGlobalAyahNumber, getVerseKey } from '@/utils/ayahMapping';

// ============================================
// HELPERS
// ============================================

// « Précédent » en DERNIER : sa révélation peut nécessiter d'afficher la double
// page d'avant, ce qui ne doit pas perturber les questions posées sur la page courante.
const POSITION_ORDER: VersePositionType[] = ['first', 'middle', 'last', 'previous'];

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
 * S'il est sur la page interrogée on a sa position exacte ; sinon il se termine
 * sur la page d'avant (pageNumber - 1) et on construit une position minimale
 * (suffisante pour le masquage par clé, l'audio et le choix de la page affichée).
 */
function getPreviousVerse(
  verse: VersePosition,
  pageVerses: PageVerses,
  pageNumber: number
): VersePosition | null {
  const prevGlobal = verse.globalNumber - 1;
  if (prevGlobal < 1) return null;
  const onPage = pageVerses.verses.find((v) => v.globalNumber === prevGlobal);
  if (onPage) return onPage;
  const { surah, verse: verseNum } = fromGlobalAyahNumber(prevGlobal);
  return {
    verseKey: getVerseKey(surah, verseNum),
    surah,
    verse: verseNum,
    page: Math.max(1, pageNumber - 1),
    lines: [],
    globalNumber: prevGlobal,
  };
}

/** Page impaire (droite) de la double page contenant `page`. */
function spreadRightPage(page: number): number {
  return Math.max(1, page % 2 === 1 ? page : page - 1);
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
  pageNumber: number,
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
          ? getPreviousVerse(identifyVerse, pageVerses, pageNumber)
          : getVerseForPosition(pageVerses, pos, verseMapData),
    }))
    .filter(
      (x): x is { pos: VersePositionType; verse: VersePosition } =>
        x.verse !== null && !visible.includes(x.verse.verseKey)
    );

  remaining.forEach(({ pos, verse }, idx) => {
    // Verset précédent hors de la double page courante (page interrogée = page de
    // droite) → la révélation bascule sur la double page d'avant pour le montrer.
    const flipTo =
      pos === 'previous' && spreadRightPage(verse.page) !== spreadRightPage(pageNumber)
        ? verse.page
        : undefined;

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
        title: flipTo ? `${POSITION_LABEL[pos]} (page d’avant)` : POSITION_LABEL[pos],
        subtitle: isLast ? 'Double page suivante' : 'Tapez pour continuer',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [...visible],
        highlightedVerse: verse.verseKey,
        revealFraction: fraction,
        displayPage: flipTo,
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
// NUMÉRO DE PAGE
// On demande « quelle est la Nᵉ page de la sourate X ? » (N = rang de la page
// dans sa sourate). L'utilisateur la retrouve, puis dévoile au tap le premier
// verset, celui du milieu, puis le dernier pour vérifier.
// ============================================

/** Ordinal français court : 1 → « 1re », n → « nᵉ ». */
function frOrdinal(n: number): string {
  return n <= 1 ? '1re' : `${n}ᵉ`;
}

export const pageNumberSteps: StepGenerator = (
  pageVerses: PageVerses,
  pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const first = pageVerses.firstVerse;
  const last = pageVerses.lastVerse;
  const middle = getMiddleVerse(pageVerses, verseMapData);
  if (!first || !last) return [];

  // Positions à dévoiler, choisies par l'utilisateur (premier / milieu / dernier).
  // Ordonnées premier→milieu→dernier ; défaut = les trois.
  const chosen = orderPositions(
    config.showPositions && config.showPositions.length > 0
      ? config.showPositions
      : ['first', 'middle', 'last']
  );
  const verseFor = (pos: VersePositionType): VersePosition | null =>
    pos === 'first' ? first : pos === 'last' ? last : pos === 'middle' ? middle : null;

  // Sourate « dominante » de la page = celle qui y a le plus de versets. Le rang
  // de la page se calcule par rapport à la première page de cette sourate.
  const counts = new Map<number, number>();
  for (const v of pageVerses.verses) counts.set(v.surah, (counts.get(v.surah) ?? 0) + 1);
  let dominant = first.surah;
  let best = -1;
  for (const [surah, c] of counts) {
    if (c > best) {
      best = c;
      dominant = surah;
    }
  }

  const info = getSurahPageInfo(dominant);
  const ordinal = info ? pageNumber - info.startPage + 1 : 1;
  const surahName = info?.nameSimple ?? '';
  const question = info
    ? `Quelle est la ${frOrdinal(ordinal)} page de ${surahName} ?`
    : 'Quelle est cette page ?';

  // Positions demandées → versets correspondants, dédoublonnés (pages courtes
  // où milieu = premier/dernier).
  const labelled = chosen
    .map((pos) => ({ verse: verseFor(pos), label: POSITION_LABEL[pos] }))
    .filter((x): x is { verse: VersePosition; label: string } => x.verse !== null);

  const seen = new Set<string>();
  const uniq = labelled.filter((x) => {
    if (seen.has(x.verse.verseKey)) return false;
    seen.add(x.verse.verseKey);
    return true;
  });

  if (uniq.length === 0) return [];

  const steps: ExerciseStep[] = [];
  const firstLabel = uniq[0].label.toLowerCase();

  // Étape 1 : la question, page entièrement masquée (rien de dévoilé).
  steps.push({
    type: 'questioning',
    targetVerse: uniq[0].verse,
    question: 'identify_page',
    message: {
      title: question,
      subtitle: `Retrouvez la page, puis tapez pour dévoiler le ${firstLabel}`,
    },
    ui: {
      isBlurred: false,
      maskAll: true,
      visibleVerses: [],
    },
  });

  // Étapes suivantes : un dévoilement par position (un seul verset visible à la fois).
  uniq.forEach(({ verse, label }, idx) => {
    const isLast = idx === uniq.length - 1;
    steps.push({
      type: 'revealing',
      targetVerse: verse,
      message: {
        title: question,
        subtitle: isLast ? `${label} — question suivante au tap` : `${label} — tapez pour la suite`,
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [verse.verseKey],
        highlightedVerse: verse.verseKey,
      },
    });
  });

  return steps;
};

// ============================================
// DÉBUT VERSET
// On dévoile uniquement le début (1/6) d'un verset sur la double page ;
// l'utilisateur récite la suite, puis tape pour révéler le verset entier.
// Petite préférence pour des versets autres que premier / milieu / dernier
// de la page (mais on ne s'en prive pas si la page n'en a pas d'autres).
// ============================================

export const verseStartSteps: StepGenerator = (
  pageVerses: PageVerses,
  _pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const verses = pageVerses.verses;
  if (verses.length === 0) return [];

  let verse: VersePosition | null = null;

  // Positions choisies par l'utilisateur (premier / milieu / dernier).
  const chosen = config.showPositions ?? [];
  if (chosen.length > 0) {
    const candidates = chosen
      .map((p) =>
        p === 'first'
          ? pageVerses.firstVerse
          : p === 'last'
            ? pageVerses.lastVerse
            : p === 'middle'
              ? getMiddleVerse(pageVerses, verseMapData)
              : null
      )
      .filter((v): v is VersePosition => Boolean(v));
    if (candidates.length > 0) verse = candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Sinon : n'importe quel verset, en évitant légèrement les versets « remarquables ».
  if (!verse) {
    const notable = new Set(
      [
        pageVerses.firstVerse?.verseKey,
        pageVerses.lastVerse?.verseKey,
        getMiddleVerse(pageVerses, verseMapData)?.verseKey,
      ].filter((k): k is string => Boolean(k))
    );
    const others = verses.filter((v) => !notable.has(v.verseKey));
    const pool = others.length > 0 && Math.random() < 0.7 ? others : verses;
    verse = pool[Math.floor(Math.random() * pool.length)];
  }

  if (!verse) return [];

  // Option : afficher aussi le 1er, le milieu et le dernier verset de la page à
  // la révélation (contexte), en plus du verset cible.
  const contextKeys = config.revealContext
    ? [pageVerses.firstVerse, getMiddleVerse(pageVerses, verseMapData), pageVerses.lastVerse]
        .filter((v): v is VersePosition => Boolean(v))
        .map((v) => v.verseKey)
    : [];
  const revealVisible = Array.from(new Set([verse.verseKey, ...contextKeys]));

  return [
    {
      type: 'questioning',
      targetVerse: verse,
      question: 'recite_verse',
      message: {
        title: 'Complétez le verset',
        subtitle: 'Voici son début — récitez la suite, puis tapez pour révéler',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: [verse.verseKey],
        highlightedVerse: verse.verseKey,
        revealFraction: 1,
      },
    },
    {
      type: 'revealing',
      targetVerse: verse,
      message: {
        title: 'Verset complet',
        subtitle: 'Question suivante au tap',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: revealVisible,
        highlightedVerse: verse.verseKey,
      },
    },
  ];
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
// DEVINE  (« Quel verset ? » / « Quelle page ? »)
//
// Mode VERSET : une page de la plage s'affiche, UN verset est masqué — à
//   retrouver, puis tap pour le révéler (surligné).
// Mode PAGE   : tout le texte est masqué, il ne reste que les séparateurs de
//   fin de verset (celui du MILIEU cerclé de rouge) et le numéro de page est
//   caché (badge de l'app + numéro imprimé du scan) — deviner la page, puis
//   tap pour la réponse et le texte.
// ============================================

export const guessSteps: StepGenerator = (
  pageVerses: PageVerses,
  pageNumber: number,
  config: ExerciseConfig,
  verseMapData?: PageVerseMap | null
): ExerciseStep[] => {
  const verses = pageVerses.verses;
  if (verses.length === 0) return [];

  const allKeys = verses.map((v) => v.verseKey);
  const middle = getMiddleVerse(pageVerses, verseMapData);

  // Sourate dominante de la page (celle qui y a le plus de versets) → rang de
  // la page DANS la sourate, comme dans « Numéro de page ».
  const counts = new Map<number, number>();
  for (const v of verses) counts.set(v.surah, (counts.get(v.surah) ?? 0) + 1);
  let dominant = verses[0].surah;
  let best = -1;
  for (const [surah, c] of counts) {
    if (c > best) {
      best = c;
      dominant = surah;
    }
  }
  const info = getSurahPageInfo(dominant);
  const ordinal = info ? pageNumber - info.startPage + 1 : 0;
  const surahName = info?.nameSimple ?? '';
  const pageAnswer = info
    ? `Page ${pageNumber} — ${frOrdinal(ordinal)} page de ${surahName}`
    : `Page ${pageNumber}`;

  // ---- Mode PAGE : séparateurs seuls, milieu en rouge, numéro caché ----
  if (config.guessMode === 'page') {
    return [
      {
        type: 'questioning',
        targetVerse: middle ?? pageVerses.firstVerse ?? undefined,
        question: 'identify_page',
        message: {
          title: 'Quelle page est-ce ?',
          subtitle:
            'Seuls les séparateurs de versets sont visibles (celui du milieu en rouge) — tape pour la réponse',
        },
        ui: {
          isBlurred: false,
          maskAll: true,
          visibleVerses: [],
          singlePage: true,
          hidePageNumber: true,
          circledVerses: middle ? [middle.verseKey] : [],
        },
      },
      {
        type: 'revealing',
        targetVerse: middle ?? pageVerses.firstVerse ?? undefined,
        message: {
          title: pageAnswer,
          subtitle: 'Question suivante au tap',
        },
        ui: {
          isBlurred: false,
          maskAll: false,
          visibleVerses: allKeys,
          singlePage: true,
          highlightedVerse: middle?.verseKey,
        },
      },
    ];
  }

  // ---- Mode VERSET : un verset masqué sur la page ----
  const target = verses[Math.floor(Math.random() * verses.length)];
  const shown = allKeys.filter((k) => k !== target.verseKey);
  const verseAnswer = surahName
    ? `${surahName} ${target.verse}`
    : `Verset ${target.verseKey}`;

  return [
    {
      type: 'questioning',
      targetVerse: target,
      question: 'identify_verse',
      message: {
        title: 'Quel est le verset masqué ?',
        subtitle: 'Récite-le, puis tape pour le révéler',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: shown,
        singlePage: true,
      },
    },
    {
      type: 'revealing',
      targetVerse: target,
      message: {
        title: verseAnswer,
        subtitle: 'Question suivante au tap',
      },
      ui: {
        isBlurred: false,
        maskAll: true,
        visibleVerses: allKeys,
        highlightedVerse: target.verseKey,
        singlePage: true,
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
  'page-number': pageNumberSteps,
  'verse-start': verseStartSteps,
  guess: guessSteps,
  hifz: hifzSteps,
  // La récitation n'utilise pas la machine à états Mushaf : interface dédiée
  // (RecitationPractice) ; ce générateur ne sert jamais.
  recitation: () => [],
  // La lecture a sa propre interface (LecturePractice) ; générateur inutilisé.
  lecture: () => [],
};
