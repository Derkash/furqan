'use client';

import { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import { PracticeShell } from '@/components/AppShell';
import OrientationControl from '@/components/OrientationControl';
import { hapticLight } from '@/utils/haptics';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useExercise } from '@/hooks/exercises/useExercise';
import { useOrientation } from '@/hooks/useOrientation';
import { useAudio } from '@/hooks/useAudio';
import { useTranslation } from '@/hooks/exercises/useTranslation';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import type { Orientation, VersePosition } from '@/types';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import MushafDoublePage from '@/components/MushafDoublePage';
import RecitationPractice from '@/components/exercises/RecitationPractice';
import LecturePractice from '@/components/exercises/LecturePractice';
import WordCard from '@/components/vocab/WordCard';
import type { ExerciseId, VersePositionType } from '@/types/exercises';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  creditRecitedVerses,
  getCurrentUser,
  getWordDifficultyMarks,
  recordVerseResult,
  recordWordMistakes,
} from '@/utils/exercises/userStats';
import { useAudioRecorder } from '@/hooks/exercises/useAudioRecorder';
import { useTafsir } from '@/hooks/exercises/useTafsir';
import { useTafsirGroups } from '@/hooks/exercises/useTafsirGroups';
import { useIbnKathir } from '@/hooks/exercises/useIbnKathir';
import { useAsbab } from '@/hooks/exercises/useAsbab';
import { prefetchSpeech, useSpeech } from '@/hooks/exercises/useSpeech';
import { getVerseRoots } from '@/utils/vocab/morphology';
import { playBeep } from '@/utils/beep';
import { getSelfAssess } from '@/utils/exercises/prefs';
import { lexiconMatchSets, matchesLexicon, type LexiconMatch } from '@/utils/vocab/vocabStore';
import Link from 'next/link';

export default function PracticePage() {
  // Suspense requis par le prérendu statique (generateStaticParams / export
  // Capacitor) : useSearchParams est utilisé plus bas dans MushafPractice.
  return (
    <Suspense fallback={null}>
      <PracticeRouter />
    </Suspense>
  );
}

function PracticeRouter() {
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  // La Lecture a son PROPRE panneau de pilotage à gauche (logo = Accueil) :
  // pas de barre générale en plus.
  if (exerciseId === 'lecture') {
    return (
      <div className="h-dvh w-full overflow-hidden ds-page" dir="ltr">
        <LecturePractice />
      </div>
    );
  }
  // Hifz : rail de pilotage dédié (comme la Lecture) — pas de coque générale.
  if (exerciseId === 'hifz') {
    return (
      <div className="h-dvh w-full overflow-hidden ds-page" dir="ltr">
        <MushafPractice />
      </div>
    );
  }
  // La récitation (micro + détection de fautes) a sa propre interface,
  // sans les pages Mushaf ni la machine à états des autres exercices.
  if (exerciseId === 'recitation') {
    return (
      <PracticeShell>
        <RecitationPractice />
      </PracticeShell>
    );
  }
  return (
    <PracticeShell>
      <MushafPractice />
    </PracticeShell>
  );
}

// Tafsir Al-Mukhtasar : masqué à la demande de l'utilisateur au profit
// d'Ibn Kathir (complet). Passer à true pour le réafficher.
const SHOW_MUKHTASAR = false;

/** Découpe un texte en phrases (pour le suivi de lecture). */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?؟…:])\s+|\n+/).filter((x) => x.trim().length > 0);
  return parts.length > 0 ? parts : [text];
}

// Suites de texte arabe (citations du verset dans le tafsir) : affichées en
// bloc séparé (retour à la ligne) et en grande police, façon tafsir imprimé.
const ARABIC_RUN =
  /((?:[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF﴿﴾][\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\s.,،؛؟:!()«»\d-]*)?[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF﴿﴾])/;

function isArabicRun(part: string): boolean {
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF﴿﴾]/.test(part);
}

/** Longueur « parlée » d'un texte : l'arabe n'est pas lu par la voix. */
function spokenLength(text: string): number {
  return text.replace(new RegExp(ARABIC_RUN.source, 'g'), '').length + 1;
}

/** Rend un texte en séparant les citations arabes : bloc centré, police ~2x. */
function renderRich(text: string, keyPrefix: string) {
  return text.split(new RegExp(ARABIC_RUN.source, 'g')).map((part, i) => {
    if (!part) return null;
    if (isArabicRun(part)) {
      const isLong = part.trim().includes(' ') || part.trim().length > 8;
      if (isLong) {
        return (
          <span
            key={`${keyPrefix}-${i}`}
            dir="rtl"
            className="block text-center my-2 text-[var(--ds-green)]"
            style={{
              fontFamily: "'UthmanicHafs', 'Amiri', 'Scheherazade New', serif",
              fontSize: '3em',
              lineHeight: 1.9,
            }}
          >
            {part.trim()}
          </span>
        );
      }
      return (
        <span
          key={`${keyPrefix}-${i}`}
          dir="rtl"
          style={{
            fontFamily: "'UthmanicHafs', 'Amiri', 'Scheherazade New', serif",
            fontSize: '1.5em',
          }}
        >
          {part}
        </span>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

/**
 * Texte dont la phrase en cours de lecture est surlignée et suivie
 * (position estimée au prorata des caractères FRANÇAIS — l'arabe n'est pas
 * lu par la voix). Les citations arabes sont rendues en bloc, grande police.
 */
function KaraokeText({
  text,
  playing,
  progress,
  className,
}: {
  text: string;
  playing: boolean;
  progress: number;
  className: string;
}) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const totalLen = useMemo(
    () => sentences.reduce((sum, x) => sum + spokenLength(x), 0),
    [sentences]
  );

  let activeIdx = -1;
  if (playing) {
    let acc = 0;
    activeIdx = sentences.length - 1;
    for (let i = 0; i < sentences.length; i++) {
      acc += spokenLength(sentences[i]);
      if (progress < acc / totalLen) {
        activeIdx = i;
        break;
      }
    }
  }

  const activeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (activeIdx >= 0) {
      activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIdx]);

  if (!playing) {
    return (
      <p className={`${className} whitespace-pre-line`}>{renderRich(text, 'r')}</p>
    );
  }
  return (
    <p className={className}>
      {sentences.map((sentence, i) => (
        <span
          key={i}
          ref={i === activeIdx ? activeRef : undefined}
          className={
            i === activeIdx
              ? 'bg-[var(--ds-gold)]/35 rounded px-0.5 transition-colors'
              : 'transition-colors'
          }
        >
          {renderRich(sentence, `k${i}`)}{' '}
        </span>
      ))}
    </p>
  );
}

function MushafPractice() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const exerciseId = params.exerciseId as string;

  const startPage = Number(searchParams.get('start')) || 3;
  const endPage = Number(searchParams.get('end')) || 10;
  // Bornes exactes au verset (hizb/juz/sourate), calculées au setup.
  const startGlobal = Number(searchParams.get('vs')) || 0;
  const endGlobal = Number(searchParams.get('ve')) || 0;
  const identifyParam = searchParams.get('identify');
  const revealParam = searchParams.get('reveal');
  const showParam = searchParams.get('show');
  const dirParam = searchParams.get('dir');
  const nParam = searchParams.get('n');
  // Quiz audio : durée de l'extrait (s), fraction révélée (1-6), mode de réponse.
  const audioSeconds = Number(searchParams.get('dur')) || 0;
  const fracParam = Number(searchParams.get('frac')) || 0;
  const answerMode = searchParams.get('ans') === 'recite' ? 'recite' : 'tap';
  // Temps autorisé (mode taper) avant révélation auto. 0 = sans limite.
  const revealTimeout = Number(searchParams.get('to')) || 0;
  // Début de verset : afficher aussi 1er/milieu/dernier verset à la révélation.
  const ctxParam = searchParams.get('ctx') === '1';
  // Devine : ce qu'il faut deviner — le verset masqué ('verse') ou la page ('page').
  const guessMode = searchParams.get('gm') === 'page' ? 'page' : 'verse';

  const {
    state,
    currentStep,
    leftPageVerses,
    rightPageVerses,
    pagePair,
    isBlurred,
    maskAll,
    visibleVerses,
    singlePage,
    hifzLevel,
    setHifzLevel,
    displayedPage,
    loading,
    canFlipPrev,
    canFlipNext,
    flipPair,
    initialize,
    start,
    nextStep,
    requeuePage,
    reset,
  } = useExercise();

  // Orientation réelle de l'écran : paysage = 2 pages côte à côte, portrait =
  // UNE seule page (feuilletage page à page). Rien n'est imposé.
  const orientation: Orientation = useOrientation();
  const portrait = orientation === 'portrait';
  const audio = useAudio();
  // Portrait : page unique affichée. Par défaut celle de la question en cours ;
  // les flèches la déplacent d'une page à la fois (au lieu d'une double page).
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  // Dernier verset joué à l'audio dans le tour courant : permet de le faire
  // répéter à tout moment (bouton dans le bandeau), à toutes les étapes.
  const [lastAudioVerse, setLastAudioVerse] = useState<VersePosition | null>(null);
  // Mode lecture plein écran (Hifz) : masque les barres du haut pour maximiser la lecture.
  const [readingMode, setReadingMode] = useState(false);
  const isHifz = exerciseId === 'hifz';
  const fullscreen = isHifz && readingMode;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewPage(displayedPage);
  }, [displayedPage]);
  const shownPage = viewPage ?? displayedPage;
  // Séparateurs de fin de verset à cercler en rouge (« Devine → Quelle page ? »).
  const circledVerses = useMemo(
    () => new Set(currentStep?.ui.circledVerses ?? []),
    [currentStep]
  );

  // Feuilletage : d'une page en portrait, d'une double page en paysage.
  const canPrev = portrait ? canFlipPrev || shownPage > pagePair.rightPage : canFlipPrev;
  const canNext = portrait ? canFlipNext || shownPage < pagePair.leftPage : canFlipNext;
  const flipView = (dir: 'prev' | 'next') => {
    if (!portrait) {
      flipPair(dir);
      return;
    }
    const target = shownPage + (dir === 'next' ? 1 : -1);
    if (target >= pagePair.rightPage && target <= pagePair.leftPage) {
      setViewPage(target);
      return;
    }
    if (dir === 'next' ? canFlipNext : canFlipPrev) {
      flipPair(dir);
      setViewPage(target);
    }
  };

  // Séquentiel : on ACCUMULE les versets révélés (début/milieu/fin) au fil des
  // pages ; ainsi, en passant de 77 à 78, ce qui a été montré sur 77 reste
  // affiché (seuls les versets de la double page courante sont visibles à l'écran).
  const [seqRevealed, setSeqRevealed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (exerciseId !== 'sequential') return;
    const vv = currentStep?.ui.visibleVerses;
    if (!vv || vv.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeqRevealed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of vv) if (!next.has(k)) { next.add(k); changed = true; }
      return changed ? next : prev;
    });
  }, [currentStep, exerciseId]);

  const displayVisibleVerses = useMemo(() => {
    if (exerciseId !== 'sequential') return visibleVerses;
    const s = new Set(visibleVerses);
    for (const k of seqRevealed) s.add(k);
    return s;
  }, [exerciseId, visibleVerses, seqRevealed]);

  // Hifz : difficultés par mot (historique commun Hifz/Lecture/Récitation),
  // teinte d'intensité croissante selon le niveau ('diff-1' … 'diff-4').
  const [showMistakes, setShowMistakes] = useState(true);
  const [mistakeWords, setMistakeWords] = useState<Map<string, string>>(new Map());
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHifz) setMistakeWords(getWordDifficultyMarks(getCurrentUser()));
  }, [isHifz]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Hifz : s'enregistrer pendant la lecture (texte visible) et se réécouter.
  const recorder = useAudioRecorder();
  const [recElapsed, setRecElapsed] = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playbackRate, setPlaybackRate] = useState(2);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (playerRef.current) playerRef.current.playbackRate = playbackRate;
  }, [playbackRate, recorder.audioUrl]);
  useEffect(() => {
    return () => {
      if (recTimer.current) clearInterval(recTimer.current);
    };
  }, []);

  const startRecording = async () => {
    const ok = await recorder.start();
    if (!ok) return;
    setRecElapsed(0);
    if (recTimer.current) clearInterval(recTimer.current);
    recTimer.current = setInterval(() => setRecElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    if (recTimer.current) clearInterval(recTimer.current);
    recorder.stop();
  };

  // Hifz : surlignage par thème — les versets partageant le même tafsir
  // Ibn Kathir portent la même teinte (alternée entre groupes voisins).
  const [showThemes, setShowThemes] = useState(true);
  const tafsirGroups = useTafsirGroups(isHifz && showThemes);
  // Hifz : masquer les couleurs des mots du lexique (pour ne pas gêner la vision des fautes).
  const [showLexicon, setShowLexicon] = useState(true);

  // Hifz : mode « marquer mes fautes » — taper les mots ratés, puis choisir le type.
  const [markingMode, setMarkingMode] = useState(false);
  const [selWords, setSelWords] = useState<
    Map<string, { verseKey: string; position: number; page: number }>
  >(new Map());

  const declareHifzMistakes = () => {
    const user = getCurrentUser();
    const at = new Date().toISOString();
    recordWordMistakes(
      user,
      Array.from(selWords.values()).map((w) => ({ ...w, type: 'faute', at }))
    );
    for (const k of selWords.keys()) hifzFaultKeys.current.add(k);
    setMistakeWords(getWordDifficultyMarks(user));
    setSelWords(new Map());
  };

  // ---- Crédit de récitation (Hifz) : avancer vers la page suivante après un
  // temps de lecture minimal = double page récitée. Les mots en difficulté de
  // ces versets, sans nouvelle faute cette session, reçoivent un 'ok' (score −1).
  const HIFZ_MIN_READ_MS = 8000;
  const hifzPairShownAt = useRef(Date.now());
  const hifzCreditedVerses = useRef<Set<string>>(new Set());
  const hifzFaultKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    hifzPairShownAt.current = Date.now();
  }, [pagePair?.rightPage]);
  const creditHifzPair = () => {
    if (!isHifz || Date.now() - hifzPairShownAt.current < HIFZ_MIN_READ_MS) return;
    const user = getCurrentUser();
    if (!user) return;
    const keys = [...(rightPageVerses?.verses ?? []), ...(leftPageVerses?.verses ?? [])]
      .map((v) => v.verseKey)
      .filter((k) => !hifzCreditedVerses.current.has(k));
    if (keys.length === 0) return;
    const credited = creditRecitedVerses(user, keys, hifzFaultKeys.current);
    for (const k of keys) hifzCreditedVerses.current.add(k);
    if (credited > 0) setMistakeWords(getWordDifficultyMarks(user));
  };

  // Marques affichées en Hifz : fautes persistées (si visibles) + sélection en cours.
  const hifzWordMarks = useMemo(() => {
    if (!isHifz) return undefined;
    const marks = new Map<string, string>();
    if (showMistakes) for (const [k, v] of mistakeWords) marks.set(k, v);
    for (const k of selWords.keys()) marks.set(k, 'selected');
    return marks;
  }, [isHifz, showMistakes, mistakeWords, selWords]);

  // Lexique perso : surlignage des mots dont le LEMME est dans le vocabulaire,
  // dans TOUS les exercices — SAUF en Hifz quand la vision « Thèmes » est active.
  // (Le lemme, pas la racine : deux lexèmes d'une même racine ont des sens
  //  différents et ne doivent pas se surligner l'un l'autre.)
  const [lexicon, setLexicon] = useState<LexiconMatch>({ lemmas: new Set(), forms: new Set() });
  const lexSize = lexicon.lemmas.size + lexicon.forms.size;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLexicon(lexiconMatchSets());
  }, []);

  const [lexiconMarks, setLexiconMarks] = useState<Map<string, string>>(new Map());
  // Rail Hifz : layer de section (Réglages / Affichage), fermé par Valider.
  const [hifzLayer, setHifzLayer] = useState<null | 'reglages' | 'affichage'>(null);
  useEffect(() => {
    let cancelled = false;
    const verseKeys = [
      ...(rightPageVerses?.verses ?? []),
      ...(leftPageVerses?.verses ?? []),
    ].map((v) => v.verseKey);
    if (lexSize === 0 || verseKeys.length === 0) {
      setLexiconMarks(new Map());
      return;
    }
    (async () => {
      const m = new Map<string, string>();
      await Promise.all(
        verseKeys.map(async (vk) => {
          const words = await getVerseRoots(vk);
          for (const w of words) {
            if (matchesLexicon(lexicon, w)) m.set(`${vk}#${w.position}`, 'lexicon');
          }
        })
      );
      if (!cancelled) setLexiconMarks(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [rightPageVerses, leftPageVerses, lexicon, lexSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Marques combinées : lexique (sauf Hifz+Thèmes) + fautes/sélection Hifz (prioritaires).
  const combinedWordMarks = useMemo(() => {
    // Lexique visible en Hifz seulement (et en Lecture, qui a le sien).
    const lexOn = isHifz ? showLexicon && !showThemes : false;
    const base = new Map<string, string>();
    if (lexOn) for (const [k, v] of lexiconMarks) base.set(k, v);
    if (hifzWordMarks) for (const [k, v] of hifzWordMarks) base.set(k, v);
    return base.size ? base : undefined;
  }, [isHifz, showLexicon, showThemes, lexiconMarks, hifzWordMarks]);

  // Traduction Hamidullah (Hifz) : affichée seulement au tap sur un verset, en popover.
  const { translations, loading: translationLoading, load: loadTranslations } = useTranslation();
  const { data: quranUnits } = useQuranUnits();
  // popover = verset ouvert + côté du panneau (moitié OPPOSÉE à la page du verset).
  const [popover, setPopover] = useState<{ verseKey: string; side: 'left' | 'right' } | null>(null);
  // Fiche MOT (traduction + occurrences), ouverte au tap d'un mot du lexique —
  // comme en Lecture. side = moitié d'écran où l'ancrer.
  const [selected, setSelected] = useState<{
    verseKey: string;
    position: number;
    side: 'left' | 'right';
  } | null>(null);

  // Tafsir français (Al-Mukhtasar) + sabab an-nuzûl du verset ouvert,
  // avec synthèse vocale française pour chaque section.
  const tafsir = useTafsir(isHifz && SHOW_MUKHTASAR && popover ? popover.verseKey : null);
  const ibnKathir = useIbnKathir(isHifz && popover ? popover.verseKey : null);
  const { asbab, loading: asbabLoading, load: loadAsbab } = useAsbab();
  const speech = useSpeech();
  // Quelle section est en cours de lecture vocale (pour l'état des boutons).
  const [speakingSection, setSpeakingSection] = useState<'translation' | 'tafsir' | 'ibnkathir' | 'asbab' | null>(null);
  const speechStopRef = useRef(speech.stop);
  useEffect(() => {
    speechStopRef.current = speech.stop;
  }, [speech.stop]);
  // Changement/fermeture du popover → couper la lecture vocale.
  useEffect(() => {
    speechStopRef.current();
  }, [popover?.verseKey]);

  // Préchargement audio (Hifz) — l'utilisateur trouvait la synthèse trop
  // longue au clic :
  // 1. dès l'arrivée sur une double page, les audios des TRADUCTIONS de ses
  //    versets sont synthétisés en tâche de fond (textes courts) ;
  // 2. dès l'ouverture du panneau d'un verset, ses trois sections (traduction,
  //    tafsir, sabab) sont préchargées — le bouton lecture devient instantané.
  useEffect(() => {
    if (isHifz) loadTranslations();
  }, [isHifz, loadTranslations]);

  useEffect(() => {
    if (!isHifz || !translations) return;
    const verses = [
      ...(rightPageVerses?.verses ?? []),
      ...(leftPageVerses?.verses ?? []),
    ];
    // Étalé dans le temps pour ne pas concurrencer une lecture demandée au clic.
    const timers = verses.slice(0, 24).map((v, i) =>
      setTimeout(() => prefetchSpeech(translations[v.verseKey]), 1500 + i * 800)
    );
    return () => timers.forEach(clearTimeout);
  }, [isHifz, translations, leftPageVerses, rightPageVerses]);

  useEffect(() => {
    if (!isHifz || !popover) return;
    prefetchSpeech(translations?.[popover.verseKey]);
    prefetchSpeech(ibnKathir.text);
    prefetchSpeech(asbab?.[popover.verseKey]?.map((o) => o.fr).join('\n\n'));
  }, [isHifz, popover, translations, ibnKathir.text, asbab]);

  // Sections « développées » du popover : par défaut chaque section montre un
  // aperçu (3 lignes) + « Voir plus » — un clic affiche tout. L'audio se lance
  // depuis le titre sans avoir à développer.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  // Texte arabe original du sabab : affiché uniquement à la demande (bouton),
  // jamais lu par la synthèse vocale.
  const [showAsbabArabic, setShowAsbabArabic] = useState(false);
  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleSpeak = (section: 'translation' | 'tafsir' | 'ibnkathir' | 'asbab', text: string | null | undefined) => {
    if (!text) return;
    if ((speech.speaking || speech.loading) && speakingSection === section) {
      speech.stop();
      setSpeakingSection(null);
    } else {
      speech.speak(text);
      setSpeakingSection(section);
      // Déplie la section pour que le texte suive la voix.
      setOpenSections((prev) => new Set(prev).add(section));
    }
  };
  // Tap sur un verset (délégation via data-verse) :
  // - mode marquage : sélectionne/désélectionne le MOT touché (faute à déclarer)
  // - sinon : popover de traduction au point cliqué ; tap hors verset → ferme.
  const handleMushafClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHifz) return;
    const el = (e.target as HTMLElement).closest('[data-verse]');
    const verseKey = el?.getAttribute('data-verse');

    if (markingMode) {
      if (!el || !verseKey || el.classList.contains('ayah-marker')) return;
      const pos = Number(el.getAttribute('data-pos'));
      const page = Number(el.getAttribute('data-page'));
      if (!Number.isFinite(pos)) return;
      const key = `${verseKey}#${pos}`;
      setSelWords((prev) => {
        const next = new Map(prev);
        if (next.has(key)) next.delete(key);
        else next.set(key, { verseKey, position: pos, page });
        return next;
      });
      return;
    }

    // Mot du lexique surligné (hors marqueur de fin de verset) → fiche MOT
    // (traduction stockée + occurrences), comme en Lecture. Priorité au popover
    // de verset. Uniquement quand le surlignage lexique est visible.
    const lexOn = showLexicon && !showThemes;
    const pos = Number(el?.getAttribute('data-pos'));
    const isMarker = el?.classList.contains('ayah-marker');
    if (
      lexOn &&
      verseKey &&
      !isMarker &&
      Number.isFinite(pos) &&
      lexiconMarks.get(`${verseKey}#${pos}`) === 'lexicon'
    ) {
      const page = Number(el?.getAttribute('data-page'));
      setPopover(null);
      setSelected({ verseKey, position: pos, side: page % 2 === 1 ? 'left' : 'right' });
      return;
    }

    if (verseKey) {
      loadTranslations();
      loadAsbab();
      setOpenSections(new Set());
      setShowAsbabArabic(false);
      // Page impaire = côté DROIT de l'écran → panneau à GAUCHE, et inversement.
      const page = Number(el?.getAttribute('data-page'));
      setPopover({ verseKey, side: page % 2 === 1 ? 'left' : 'right' });
    } else {
      setPopover(null);
    }
  };

  // Initialize exercise
  useEffect(() => {
    if (!isValidExerciseId(exerciseId) || initialized) return;

    const parsePositions = (s: string | null): VersePositionType[] =>
      (s ? s.split(',').filter(Boolean) : []) as VersePositionType[];

    initialize({
      exerciseId: exerciseId as ExerciseId,
      startPage,
      endPage,
      startGlobal: startGlobal > 0 ? startGlobal : undefined,
      endGlobal: endGlobal > 0 ? endGlobal : undefined,
      maxRounds: nParam ? Number(nParam) || undefined : undefined,
      identifyPosition: (identifyParam ?? undefined) as VersePositionType | undefined,
      revealAfter: parsePositions(revealParam),
      showPositions: parsePositions(showParam),
      direction: (dirParam ?? undefined) as 'forward' | 'backward' | undefined,
      audioSeconds: audioSeconds > 0 ? audioSeconds : undefined,
      revealFraction: fracParam >= 1 && fracParam <= 6 ? fracParam : undefined,
      answerMode,
      revealTimeout: revealTimeout > 0 ? revealTimeout : undefined,
      revealContext: ctxParam,
      guessMode,
    }).then(() => {
      setInitialized(true);
    });
  }, [exerciseId, startPage, endPage, startGlobal, endGlobal, nParam, identifyParam, revealParam, showParam, dirParam, audioSeconds, fracParam, answerMode, revealTimeout, ctxParam, guessMode, initialize, initialized]);

  // Auto-start when initialized
  useEffect(() => {
    if (initialized && state.status === 'idle') {
      start();
    }
  }, [initialized, state.status, start]);

  // Play audio when step is listening
  // Note: on utilise audio.play dans une ref pour éviter les boucles infinies
  const audioPlayRef = useRef(audio.play);
  useEffect(() => {
    audioPlayRef.current = audio.play;
  }, [audio.play]);

  // Bip à chaque transition d'un verset à l'autre (nouveau verset écouté).
  const lastBeepVerseRef = useRef<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentStep?.type === 'listening' && currentStep.targetVerse) {
      const vk = currentStep.targetVerse.verseKey;
      if (lastBeepVerseRef.current !== null && lastBeepVerseRef.current !== vk) playBeep();
      lastBeepVerseRef.current = vk;
      audioPlayRef.current(currentStep.targetVerse, audioSeconds > 0 ? audioSeconds : undefined);
      setLastAudioVerse(currentStep.targetVerse);
    }
  }, [currentStep, audioSeconds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Début de verset : à la révélation, réciter le verset à ×2 en même temps
  // que son affichage.
  useEffect(() => {
    if (exerciseId === 'verse-start' && currentStep?.type === 'revealing' && currentStep.targetVerse) {
      audioPlayRef.current(currentStep.targetVerse, undefined, 2);
    }
  }, [currentStep, exerciseId]);

  // ---- Quiz audio : question en grand sur la moitié opposée + réponse par récitation ----
  const isQuiz = exerciseId === 'audio-quiz';
  // « Numéro de page » : même panneau de question en grand (sans audio ni micro).
  const isPageNumber = exerciseId === 'page-number';
  const awaitingRecitation = isQuiz && currentStep?.ui.awaitsRecitation === true;
  // La question s'affiche pendant les étapes "questioning" uniquement (pas pendant
  // l'écoute, pour ne pas trahir de quel côté se trouve le verset à localiser).
  const showQuestionPanel = (isQuiz || isPageNumber) && currentStep?.type === 'questioning';
  // La question s'affiche sur la moitié OPPOSÉE à la page du verset visé
  // (page impaire → affichée à droite → question à gauche, et inversement).
  const roundPage = state.currentRound?.pageNumber ?? 0;
  const targetPage = currentStep?.targetVerse?.page ?? roundPage;
  const questionSide: 'left' | 'right' = targetPage % 2 === 1 ? 'left' : 'right';

  // Fin d'enregistrement pendant une question → on révèle le verset (nextStep)
  // et le lecteur reste affiché pour se réécouter.
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (recorder.recording) {
      wasRecordingRef.current = true;
      return;
    }
    if (wasRecordingRef.current && recorder.audioUrl && awaitingRecitation) {
      wasRecordingRef.current = false;
      nextStep();
    }
  }, [recorder.recording, recorder.audioUrl, awaitingRecitation, nextStep]);

  // Nouvelle question (ou nouvelle écoute) → on repart d'un enregistreur propre.
  const recorderClearRef = useRef(recorder.clear);
  useEffect(() => {
    recorderClearRef.current = recorder.clear;
  }, [recorder.clear]);
  useEffect(() => {
    if (isQuiz && (currentStep?.type === 'questioning' || currentStep?.type === 'listening')) {
      recorderClearRef.current();
    }
  }, [isQuiz, currentStep]);

  // ---- Compte à rebours (mode taper) : à 0, révélation automatique du verset ----
  // S'applique à la localisation (écoute) et aux questions de rappel, jamais en
  // mode récitation (qui se temporise via la fin de l'enregistrement).
  const timedStep =
    isQuiz &&
    answerMode === 'tap' &&
    revealTimeout > 0 &&
    (currentStep?.type === 'listening' ||
      (currentStep?.type === 'questioning' && !awaitingRecitation));
  const [countdown, setCountdown] = useState(0);
  const nextStepRef = useRef(nextStep);
  useEffect(() => {
    nextStepRef.current = nextStep;
  }, [nextStep]);
  const audioStopRef = useRef(audio.stop);
  useEffect(() => {
    audioStopRef.current = audio.stop;
  }, [audio.stop]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!timedStep) {
      setCountdown(0);
      return;
    }
    let left = revealTimeout;
    setCountdown(left);
    const id = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(id);
        audioStopRef.current();
        nextStepRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timedStep, currentStep, revealTimeout]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // « Avez-vous trouvé ? » : demandé en fin de tour pour les exercices de quiz,
  // et mémorisé pour orienter les prochaines interrogations vers les échecs.
  const [askFound, setAskFound] = useState(false);
  const [selfAssess, setSelfAssessState] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelfAssessState(getSelfAssess());
  }, []);
  const asksFeedback =
    selfAssess &&
    (exerciseId === 'audio-quiz' ||
      exerciseId === 'sequential' ||
      exerciseId === 'page-number' ||
      exerciseId === 'verse-start' ||
      exerciseId === 'guess');
  const roundTargets = useMemo(() => {
    const seen = new Map<string, number>();
    for (const step of state.currentRound?.steps ?? []) {
      if (step.targetVerse) seen.set(step.targetVerse.verseKey, step.targetVerse.page);
    }
    return Array.from(seen, ([verseKey, page]) => ({ verseKey, page }));
  }, [state.currentRound]);

  const answerFound = (found: boolean) => {
    const user = getCurrentUser();
    const at = new Date().toISOString();
    for (const t of roundTargets) {
      recordVerseResult(user, { verseKey: t.verseKey, page: t.page, found, exercise: exerciseId, at });
    }
    // Faux → re-poser la question sur cette page peu de tours plus tard (session).
    if (!found) {
      requeuePage(state.currentRound?.pageNumber ?? state.progress.currentPage);
    }
    setAskFound(false);
    nextStep();
  };

  // Handle tap
  const handleTap = () => {
    // Arrêter l'audio en cours si il y en a
    audio.stop();

    if (state.status === 'completed') {
      router.push(`/exercises/${exerciseId}/setup`);
      return;
    }
    // En Hifz, on reste sur la page : pas d'avancement au tap
    if (exerciseId === 'hifz') return;
    if (askFound) return;
    // Question à réciter : le tap n'avance pas, c'est la fin de l'enregistrement
    // qui révèle (bouton « Révéler sans réciter » pour passer).
    if (awaitingRecitation) return;

    // Dernière étape du tour d'un quiz → demander d'abord « trouvé ou pas ? »
    if (
      asksFeedback &&
      state.currentRound &&
      state.currentRound.currentStepIndex === state.currentRound.steps.length - 1 &&
      roundTargets.length > 0
    ) {
      setAskFound(true);
      return;
    }
    nextStep();
  };

  // Validate exercise ID
  if (!isValidExerciseId(exerciseId)) {
    return (
      <div className="min-h-screen bg-[var(--ds-bg)] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">Exercice non trouvé</p>
          <Link href="/exercises" className="text-[var(--ds-green)] underline">
            Retour aux exercices
          </Link>
        </div>
      </div>
    );
  }

  const exercise = getExerciseDefinition(exerciseId as ExerciseId);

  // Loading state
  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-[var(--ds-bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[var(--ds-green)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--ds-sage)]">Chargement...</p>
        </div>
      </div>
    );
  }

  // Completed state
  if (state.status === 'completed') {
    return (
      <div className="min-h-screen bg-[var(--ds-bg)] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[var(--ds-green)] text-center">
          <h2 className="text-2xl font-bold text-[var(--ds-green)] mb-2">Terminé !</h2>
          <p className="text-[var(--ds-sage)] mb-4">
            Vous avez terminé {toArabicNumbers(state.progress.totalRounds)} question
            {state.progress.totalRounds > 1 ? 's' : ''}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                reset();
                setInitialized(false);
              }}
              className="px-4 py-2 bg-[var(--ds-gold)] hover:bg-[#b89848] text-white rounded-lg"
            >
              Recommencer
            </button>
            <Link
              href="/exercises"
              className="px-4 py-2 bg-[var(--ds-green)] hover:bg-[var(--ds-sage)] text-white rounded-lg"
            >
              Autres exercices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[var(--ds-bg)] flex flex-col relative overflow-locked">
      {/* ---- Rail Hifz (comme la Lecture) : icônes seules, layers avec Valider ---- */}
      {isHifz && (
        <aside dir="ltr" className="absolute left-0 inset-y-0 z-40 w-[60px] bg-white flex flex-col items-center overflow-y-auto py-3 gap-1.5 border-r border-[var(--ds-divider)]" style={{ fontFamily: 'var(--ds-font)' }}>
          <Link href="/exercises" title="Accueil" className="flex flex-col items-center gap-0.5 mb-1.5">
            <span className="text-[20px] leading-none text-[var(--ds-gold)]" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
              ع
            </span>
            <span className="text-[6px] font-extrabold tracking-[0.16em] text-[var(--ds-n600)]">MURAJA3A</span>
          </Link>
          <button
            onClick={() => setHifzLayer(hifzLayer === 'reglages' ? null : 'reglages')}
            title="Réglages"
            className={`flex flex-col items-center gap-0.5 w-12 py-1.5 rounded-xl transition-colors ${
              hifzLayer === 'reglages' ? 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]' : 'text-[var(--ds-n500)] hover:text-[var(--ds-green)]'
            }`}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span className="text-[7px] font-bold uppercase tracking-wider">Réglages</span>
          </button>
          <button
            onClick={() => setHifzLayer(hifzLayer === 'affichage' ? null : 'affichage')}
            title="Affichage"
            className={`flex flex-col items-center gap-0.5 w-12 py-1.5 rounded-xl transition-colors ${
              hifzLayer === 'affichage' ? 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]' : 'text-[var(--ds-n500)] hover:text-[var(--ds-green)]'
            }`}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-[7px] font-bold uppercase tracking-wider">Affichage</span>
          </button>
          <span className="mt-1 text-[9px] font-extrabold text-[var(--ds-n500)] uppercase tracking-wider">Niv. {hifzLevel}</span>
          <div className="w-8 h-px bg-[var(--ds-divider)] my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (recorder.recording) stopRecording();
              else startRecording();
            }}
            title={recorder.recording ? "Arrêter l'enregistrement" : 'S’enregistrer'}
            className={`w-11 h-11 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white active:scale-95 transition-all ${
              recorder.recording ? 'animate-pulse' : ''
            }`}
          >
            {recorder.recording ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        </aside>
      )}
      {isHifz && hifzLayer && (
        <>
          <button aria-label="Fermer" className="absolute inset-0 z-40 bg-black/25" onClick={() => setHifzLayer(null)} />
          <div
            dir="ltr"
            className="absolute left-[64px] top-2 max-h-[calc(100%-16px)] z-50 w-[280px] max-w-[78vw] bg-white rounded-2xl p-4 overflow-y-auto flex flex-col"
            style={{ boxShadow: 'var(--ds-shadow-lg)', fontFamily: 'var(--ds-font)' }}
          >
            {hifzLayer === 'reglages' && (
              <div>
                <p className="ds-kicker mb-2">Niveau de masquage</p>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setHifzLevel(lvl)}
                      className={`min-w-[40px] py-2 rounded-xl text-sm font-bold transition-colors ${
                        hifzLevel === lvl ? 'bg-[var(--ds-green)] text-white' : 'bg-[var(--ds-sage-100)] text-[var(--ds-n700)]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--ds-n600)] mt-2">0 = tout visible · 8 = quasi tout masqué</p>
                <OrientationControl className="mt-4" />
              </div>
            )}
            {hifzLayer === 'affichage' && (
              <div>
                <p className="ds-kicker mb-2">Affichage</p>
                <div className="flex flex-col gap-0.5">
                  {[
                    { label: 'Thèmes', active: showThemes, onClick: () => setShowThemes((t) => !t) },
                    {
                      label: '✍ Marquer',
                      active: markingMode,
                      onClick: () =>
                        setMarkingMode((m) => {
                          if (!m) setPopover(null);
                          else setSelWords(new Map());
                          return !m;
                        }),
                    },
                    {
                      label: mistakeWords.size > 0 ? `Fautes (${toArabicNumbers(mistakeWords.size)})` : 'Fautes',
                      active: showMistakes && mistakeWords.size > 0,
                      onClick: () => setShowMistakes((s) => !s),
                    },
                    { label: 'Lexique', active: showLexicon, onClick: () => setShowLexicon((s) => !s) },
                  ].map((t) => (
                    <button
                      key={t.label}
                      onClick={t.onClick}
                      className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-[13px] font-bold transition-colors ${
                        t.active ? 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]' : 'text-[var(--ds-n700)] hover:bg-[var(--ds-sage-100)]/60'
                      }`}
                    >
                      <span className="truncate">{t.label}</span>
                      <span className={`flex-none w-8 h-[18px] rounded-full relative transition-colors ${t.active ? 'bg-[var(--ds-green)]' : 'bg-[var(--ds-n400)]'}`}>
                        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${t.active ? 'left-[16px]' : 'left-[2px]'}`} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setHifzLayer(null)} className="ds-btn-gold w-full py-2.5 text-sm mt-4 flex-none">
              Valider
            </button>
          </div>
        </>
      )}
      {/* Message d'étape : pilule flottante — seulement si aucun panneau ne guide déjà */}
      {currentStep && !fullscreen && !showQuestionPanel && (
        <div
          className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 max-w-[94%] flex items-center gap-2 bg-white/95 rounded-full px-4 py-1.5"
          style={{ boxShadow: 'var(--ds-shadow-md)', fontFamily: 'var(--ds-font)' }}
        >
          {audio.isPlaying && (
            <div className="flex gap-0.5 flex-none">
              <span className="w-0.5 h-3 bg-[var(--ds-gold)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-0.5 h-3 bg-[var(--ds-gold)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-0.5 h-3 bg-[var(--ds-gold)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          <span className="text-[13px] font-bold text-[var(--ds-text)] truncate">{currentStep.message.title}</span>
          <span className="text-[12px] text-[var(--ds-n600)] truncate hidden sm:inline">{currentStep.message.subtitle}</span>
          {lastAudioVerse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                audio.play(lastAudioVerse, audioSeconds > 0 ? audioSeconds : undefined);
              }}
              aria-label="Faire répéter le verset"
              className="flex-none w-7 h-7 rounded-full flex items-center justify-center bg-[var(--ds-sage-100)] text-[var(--ds-green)] hover:bg-[var(--ds-sage-200)] active:scale-95 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {timedStep && countdown > 0 && (
            <span className="flex-none flex items-center gap-1 text-[var(--ds-gold-700)] text-sm font-bold tabular-nums">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2 2" />
              </svg>
              {countdown}s
            </span>
          )}
        </div>
      )}

      {/* Zone Mushaf */}
      <div className="book-centered flex-1 min-h-0 relative overflow-hidden flex flex-col" style={{ paddingLeft: isHifz ? 60 : 0 }} onClick={handleMushafClick}>
        <div className="book-area w-full flex-1 min-h-0 flex justify-center items-start overflow-hidden">
        <div className={portrait || singlePage ? 'book-box book-box-single' : 'book-box'}>
        <MushafDoublePage
          leftPageVerses={leftPageVerses}
          rightPageVerses={rightPageVerses}
          pagePair={pagePair}
          orientation={orientation}
          revealedVerses={displayVisibleVerses}
          visibleVerses={displayVisibleVerses}
          isBlurred={isBlurred}
          maskAll={maskAll}
          wordMarks={combinedWordMarks}
          circledMarkerVerseKeys={circledVerses}
          hidePageNumber={currentStep?.ui.hidePageNumber}
          verseThemes={isHifz && showThemes ? tafsirGroups : null}
          loading={loading}
          singlePage={singlePage}
          currentPage={portrait || singlePage ? shownPage : undefined}
          hifzLevel={exerciseId === 'hifz' ? hifzLevel : undefined}
          revealFraction={currentStep?.ui.revealFraction}
          onTap={handleTap}
        />
        </div>
        </div>

        {/* Question du quiz : en GRAND sur la moitié opposée à la page interrogée */}
        {showQuestionPanel && currentStep && (
          <div
            onClick={() => {
              if (!awaitingRecitation) handleTap();
            }}
            className={`absolute inset-y-0 z-20 w-1/2 flex items-center justify-center p-4 ${
              questionSide === 'left' ? 'left-0' : 'right-0'
            }`}
          >
            <div className="bg-[var(--ds-bg)]/[0.97] backdrop-blur border-2 border-[var(--ds-gold)] rounded-3xl shadow-2xl px-6 py-8 w-full max-w-md text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-3">
                Question
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-[var(--ds-green)] leading-snug mb-2">
                {currentStep.message.title}
              </p>
              <p className="text-sm text-[var(--ds-sage)] mb-6">{currentStep.message.subtitle}</p>

              {lastAudioVerse && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    audio.play(lastAudioVerse, audioSeconds > 0 ? audioSeconds : undefined);
                  }}
                  className="mx-auto mb-5 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--ds-green)]/10 text-[var(--ds-green)] hover:bg-[var(--ds-green)]/20 font-bold text-sm active:scale-95 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Réécouter le verset
                </button>
              )}

              {awaitingRecitation ? (
                <>
                  {recorder.recording ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-bold tabular-nums text-[var(--ds-green)] text-3xl">
                          {Math.floor(recElapsed / 60)}:{String(recElapsed % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          stopRecording();
                        }}
                        aria-label="Arrêter l'enregistrement et révéler"
                        className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all"
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      </button>
                      <p className="text-xs text-gray-500">Stop = révélation du verset</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRecording();
                        }}
                        className="flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white rounded-full px-8 py-4 shadow-xl font-bold text-lg active:scale-95 transition-all"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                        Réciter
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          nextStep();
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Révéler sans réciter
                      </button>
                      {recorder.error && (
                        <p className="text-[11px] text-red-600">{recorder.error}</p>
                      )}
                    </div>
                  )}
                </>
              ) : timedStep ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="text-5xl font-bold tabular-nums text-[var(--ds-green)] leading-none">
                    {countdown}
                  </div>
                  <p className="text-xs text-gray-400">
                    Révélation automatique à la fin — ou tapez pour révéler
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Tapez l&apos;écran pour révéler</p>
              )}
            </div>
          </div>
        )}

        {/* Récitation enregistrée (quiz) : lecteur pour se réécouter après la révélation */}
        {isQuiz && recorder.audioUrl && !recorder.recording && !showQuestionPanel && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 bg-[var(--ds-bg)]/95 backdrop-blur border-2 border-[var(--ds-gold)] rounded-2xl px-3 py-2 shadow-lg">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--ds-gold)]">
                Ma récitation
              </span>
              <audio controls src={recorder.audioUrl} className="h-8 w-52" />
              <button
                type="button"
                onClick={recorder.clear}
                aria-label="Fermer le lecteur"
                className="w-8 h-8 rounded-full bg-[var(--ds-green)]/10 text-[var(--ds-green)] hover:bg-[var(--ds-green)]/20 flex items-center justify-center active:scale-95 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Barre de déclaration de fautes (Hifz, mode marquage) */}
        {isHifz && markingMode && selWords.size > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,480px)]">
            <div
              className="bg-[var(--ds-bg)]/95 backdrop-blur border-2 border-red-300 rounded-2xl shadow-lg px-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              {getCurrentUser() ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[11px] font-bold uppercase tracking-widest text-red-600">
                    {toArabicNumbers(selWords.size)} mot{selWords.size > 1 ? 's' : ''} sélectionné{selWords.size > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelWords(new Map())}
                    className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={declareHifzMistakes}
                    className="py-1.5 px-4 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all"
                  >
                    Faute
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Connectez-vous (exercice Récitation ou tableau de bord) pour mémoriser vos fautes.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Enregistreur (Hifz) : s'enregistrer en lisant, puis se réécouter */}
        {isHifz && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {recorder.recording ? (
              <div className="flex items-center gap-2.5 bg-[var(--ds-bg)]/95 backdrop-blur border-2 border-red-300 rounded-full pl-4 pr-1.5 py-1.5 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold tabular-nums text-[var(--ds-green)] text-lg">
                  {Math.floor(recElapsed / 60)}:{String(recElapsed % 60).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  aria-label="Arrêter l'enregistrement"
                  className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow active:scale-95 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </div>
            ) : recorder.audioUrl ? (
              <div className="flex items-center gap-2 bg-[var(--ds-bg)]/95 backdrop-blur border-2 border-[var(--ds-gold)] rounded-2xl px-3 py-2 shadow-lg flex-wrap justify-center">
                <audio
                  ref={playerRef}
                  controls
                  src={recorder.audioUrl}
                  className="h-8 w-52"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.playbackRate = playbackRate;
                  }}
                />
                <span className="flex items-center gap-1">
                  {[1, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                        playbackRate === rate
                          ? 'bg-[var(--ds-green)] text-[var(--ds-bg)]'
                          : 'bg-white border border-[var(--ds-gold)]/40 text-[var(--ds-sage)]'
                      }`}
                    >
                      ×{rate === 1.5 ? '1,5' : rate}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={startRecording}
                  aria-label="Nouvel enregistrement"
                  className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={recorder.clear}
                  aria-label="Fermer le lecteur"
                  className="w-8 h-8 rounded-full bg-[var(--ds-green)]/10 text-[var(--ds-green)] hover:bg-[var(--ds-green)]/20 flex items-center justify-center active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ) : null /* bouton d'enregistrement : sur le rail Hifz */}
            {recorder.error && (
              <p className="mt-1 text-center text-[11px] text-red-600 bg-white/90 rounded-full px-3 py-0.5 shadow">
                {recorder.error}
              </p>
            )}
          </div>
        )}

        {/* Boutons de feuilletage (Hifz) : extrémités gauche/droite, centrés verticalement.
            Lecture RTL : avancer (pages suivantes) = aller vers la GAUCHE. */}
        {exerciseId === 'hifz' && (
          <>
            {/* Droite de l'écran → pages précédentes (numéros plus petits) */}
            <button
              type="button"
              aria-label="Pages précédentes"
              disabled={!canPrev}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                hapticLight();
                flipView('prev');
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[var(--ds-gold)]/40 transition-opacity ${
                canPrev
                  ? 'bg-[var(--ds-green)]/90 text-[var(--ds-bg)] hover:bg-[var(--ds-green)] active:scale-95'
                  : 'bg-[var(--ds-green)]/30 text-[var(--ds-bg)]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>

            {/* Gauche de l'écran → pages suivantes (numéros plus grands) */}
            <button
              type="button"
              aria-label="Pages suivantes"
              disabled={!canNext}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                hapticLight();
                creditHifzPair();
                flipView('next');
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[var(--ds-gold)]/40 transition-opacity ${
                canNext
                  ? 'bg-[var(--ds-green)]/90 text-[var(--ds-bg)] hover:bg-[var(--ds-green)] active:scale-95'
                  : 'bg-[var(--ds-green)]/30 text-[var(--ds-bg)]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </>
        )}

      {/* Fiche MOT du lexique (traduction stockée + occurrences), comme en Lecture. */}
      {isHifz && selected && (
        <WordCard
          verseKey={selected.verseKey}
          position={selected.position}
          side={selected.side}
          variant="sheet"
          onClose={() => setSelected(null)}
          onAdded={() => setLexicon(lexiconMatchSets())}
          onRemoved={() => {
            setLexicon(lexiconMatchSets()); // le mot retiré n'est plus surligné
            setSelected(null);
          }}
        />
      )}

      {isHifz && popover && (() => {
        const [sNum, aNum] = popover.verseKey.split(':').map(Number);
        const chapter = quranUnits?.chapters.find((c) => c.id === sNum);
        const text = translations?.[popover.verseKey];
        const asbabTexts = asbab?.[popover.verseKey];
        // Audio : uniquement la traduction française (l'arabe est là pour info).
        const asbabFull = asbabTexts?.map((o) => o.fr).join('\n\n') ?? null;

        const speakerButton = (
          section: 'translation' | 'tafsir' | 'ibnkathir' | 'asbab',
          speakText: string | null | undefined
        ) =>
          speakText ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSpeak(section, speakText);
              }}
              aria-label="Écouter cette section"
              className={`flex-none w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition ${
                (speech.speaking || speech.loading) && speakingSection === section
                  ? 'bg-[var(--ds-green)] text-[var(--ds-bg)]'
                  : 'bg-[var(--ds-green)]/10 text-[var(--ds-green)] hover:bg-[var(--ds-green)]/20'
              }`}
            >
              {speech.loading && speakingSection === section ? (
                <span className="w-4 h-4 border-2 border-[var(--ds-bg)] border-t-transparent rounded-full animate-spin" />
              ) : speech.speaking && speakingSection === section ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                  <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ) : null;

        const sectionHeader = (
          section: 'translation' | 'tafsir' | 'ibnkathir' | 'asbab',
          title: string,
          speakText: string | null | undefined
        ) => (
          <div className="flex items-center justify-between gap-1 py-1.5">
            <span className="text-[12px] font-bold uppercase tracking-widest text-[var(--ds-gold)]">
              {title}
            </span>
            {speakerButton(section, speakText)}
          </div>
        );

        // Lien « Voir plus / Réduire » sous les textes longs.
        const seeMore = (section: string, contentLength: number) =>
          contentLength > 200 ? (
            <button
              type="button"
              onClick={() => toggleSection(section)}
              className="text-[13px] font-semibold text-[var(--ds-sage)] underline mb-1.5"
            >
              {openSections.has(section) ? 'Réduire' : 'Voir plus'}
            </button>
          ) : null;

        const isPlaying = (section: string) =>
          speech.speaking && speakingSection === section;

        return (
          <div
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-y-0 z-30 w-1/2 bg-[var(--ds-bg)]/[0.98] backdrop-blur overflow-y-auto overscroll-contain shadow-[0_0_40px_rgba(45,80,22,0.3)] ${
              popover.side === 'left'
                ? 'left-0 border-r-2 border-[var(--ds-gold)]'
                : 'right-0 border-l-2 border-[var(--ds-gold)]'
            }`}
          >
            <div className="px-5 pt-3 pb-8 max-w-xl mx-auto">
              {/* Entête : référence du verset + fermeture */}
              <div className="sticky top-0 -mx-5 px-5 py-2 bg-[var(--ds-bg)]/95 backdrop-blur z-10 flex items-center justify-between gap-2 border-b border-[var(--ds-gold)]/30 mb-2">
                <div className="text-lg font-bold text-[var(--ds-green)] flex items-center gap-2 flex-wrap min-w-0">
                  <span>
                    {sNum}:{aNum}
                    {chapter ? ` · ${chapter.name_simple}` : ''}
                  </span>
                  {chapter && (
                    <span
                      className="text-[var(--ds-sage)]"
                      dir="rtl"
                      style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
                    >
                      {chapter.name_arabic}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setPopover(null)}
                  className="flex-none w-9 h-9 rounded-full flex items-center justify-center bg-[var(--ds-green)]/10 text-[var(--ds-green)] hover:bg-[var(--ds-green)]/20 active:scale-95 transition"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              {/* Section 1 : traduction Hamidullah */}
              {sectionHeader('translation', 'Traduction — Hamidullah', text)}
              {text ? (
                <div
                  onClick={() => !openSections.has('translation') && toggleSection('translation')}
                  className={
                    openSections.has('translation') || isPlaying('translation')
                      ? ''
                      : 'line-clamp-3 cursor-pointer'
                  }
                >
                  <KaraokeText
                    text={text}
                    playing={isPlaying('translation')}
                    progress={speech.progress}
                    className="text-[17px] leading-relaxed text-[#1a1a1a] pb-1"
                  />
                </div>
              ) : (
                <p className="text-[15px] text-gray-400 pb-1">
                  {translationLoading ? 'Chargement de la traduction…' : 'Traduction indisponible.'}
                </p>
              )}
              {seeMore('translation', text?.length ?? 0)}

              {/* Section 2 : tafsir Ibn Kathir (complet, EN→FR par IA) */}
              <div className="border-t border-[var(--ds-gold)]/30 mt-2" />
              {sectionHeader('ibnkathir', 'Tafsir — Ibn Kathir', ibnKathir.text)}
              {ibnKathir.text ? (
                <>
                  <p className="text-[11px] font-semibold text-red-600 mb-1.5">
                    Traduit de l&apos;anglais (abrégé) au français par l&apos;IA.
                  </p>
                  <div
                    onClick={() => !openSections.has('ibnkathir') && toggleSection('ibnkathir')}
                    className={
                      openSections.has('ibnkathir') || isPlaying('ibnkathir')
                        ? ''
                        : 'line-clamp-3 cursor-pointer'
                    }
                  >
                    <KaraokeText
                      text={ibnKathir.text}
                      playing={isPlaying('ibnkathir')}
                      progress={speech.progress}
                      className="text-[16px] leading-relaxed text-[#1a1a1a] pb-1"
                    />
                  </div>
                  {seeMore('ibnkathir', ibnKathir.text.length)}
                </>
              ) : (
                <p className="text-[15px] text-gray-400 pb-1">
                  {ibnKathir.loading
                    ? 'Chargement du tafsir… (la première consultation d’un verset peut prendre ~10 s)'
                    : 'Tafsir indisponible pour ce verset.'}
                </p>
              )}

              {/* Section Al-Mukhtasar (masquée — SHOW_MUKHTASAR pour réactiver) */}
              {SHOW_MUKHTASAR && (
                <>
                  <div className="border-t border-[var(--ds-gold)]/30 mt-2" />
                  {sectionHeader('tafsir', 'Tafsir — Al-Mukhtasar', tafsir.text)}
                  <KaraokeText
                    text={tafsir.text ?? ''}
                    playing={isPlaying('tafsir')}
                    progress={speech.progress}
                    className="text-[16px] leading-relaxed text-[#1a1a1a] pb-1"
                  />
                </>
              )}

              {/* Section 3 : sabab an-nuzûl (occasions authentifiées) */}
              <div className="border-t border-[var(--ds-gold)]/30 mt-2" />
              {sectionHeader('asbab', 'Sabab an-Nuzûl — authentifié', asbabFull)}
              {asbabTexts && asbabTexts.length > 0 && asbabFull ? (
                <>
                  <p className="text-[11px] font-semibold text-red-600 mb-1.5">
                    Traduit de l&apos;arabe au français par l&apos;IA — en cas de doute,
                    référez-vous au texte original ci-dessous.
                  </p>
                  <div
                    onClick={() => !openSections.has('asbab') && toggleSection('asbab')}
                    className={
                      openSections.has('asbab') || isPlaying('asbab')
                        ? ''
                        : 'line-clamp-3 cursor-pointer'
                    }
                  >
                    {isPlaying('asbab') ? (
                      <KaraokeText
                        text={asbabFull}
                        playing
                        progress={speech.progress}
                        className="text-[16px] leading-relaxed text-[#1a1a1a] pb-1"
                      />
                    ) : (
                      <div className="space-y-2 pb-1">
                        {asbabTexts.map((occasion, i) => (
                          <p key={i} className="text-[16px] leading-relaxed text-[#1a1a1a] whitespace-pre-line">
                            {asbabTexts.length > 1 && (
                              <span className="font-bold text-[#7a5d2c]">
                                Récit {toArabicNumbers(i + 1)} —{' '}
                              </span>
                            )}
                            {occasion.fr}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {seeMore('asbab', asbabFull.length)}

                  {/* Texte arabe original : pour info, à la demande, hors audio */}
                  <button
                    type="button"
                    onClick={() => setShowAsbabArabic((v) => !v)}
                    className="mt-1 mb-1 text-[13px] font-semibold text-[#7a5d2c] bg-[var(--ds-gold)]/15 border border-[var(--ds-gold)]/30 rounded-full px-3 py-1.5 active:scale-95 transition"
                  >
                    {showAsbabArabic ? 'Masquer le texte original (arabe)' : 'Texte original (arabe)'}
                  </button>
                  {showAsbabArabic && (
                    <div className="space-y-2 pb-1 border-t border-[var(--ds-gold)]/20 pt-2">
                      {asbabTexts.map((occasion, i) => (
                        <p
                          key={i}
                          dir="rtl"
                          className="text-[18px] leading-loose text-[#1a1a1a] whitespace-pre-line"
                          style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif" }}
                        >
                          {occasion.ar}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[15px] text-gray-400 pb-1">
                  {asbabLoading
                    ? 'Chargement…'
                    : 'Aucun sabab an-nuzûl authentifié rapporté pour ce verset.'}
                </p>
              )}
            </div>
          </div>
        );
      })()}
      </div>

      {/* Question de fin de tour : « Avez-vous trouvé ? » (exercices de quiz) */}
      {askFound && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-[var(--ds-bg)] border-2 border-[var(--ds-gold)] rounded-2xl shadow-xl p-5 w-[min(90vw,340px)] text-center">
            <p className="text-lg font-bold text-[var(--ds-green)] mb-1">Avez-vous trouvé ?</p>
            <p className="text-xs text-gray-500 mb-4">
              Votre réponse oriente les prochaines questions vers ce que vous ratez.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => answerFound(true)}
                className="flex-1 py-3 rounded-xl bg-[var(--ds-green)] hover:bg-[var(--ds-sage)] text-white font-bold active:scale-95 transition-all"
              >
                ✓ Oui
              </button>
              <button
                type="button"
                onClick={() => answerFound(false)}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold active:scale-95 transition-all"
              >
                ✗ Non
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popover de traduction Hamidullah, positionné au point cliqué (Hifz uniquement) */}
    </div>
  );
}
