'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useExercise } from '@/hooks/exercises/useExercise';
import { useAudio } from '@/hooks/useAudio';
import { useTranslation } from '@/hooks/exercises/useTranslation';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import type { Orientation, VersePosition } from '@/types';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import MushafDoublePage from '@/components/MushafDoublePage';
import RecitationPractice from '@/components/exercises/RecitationPractice';
import type { ExerciseId, VersePositionType } from '@/types/exercises';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getCurrentUser,
  getMistakeWordMarks,
  MISTAKE_TYPE_META,
  recordVerseResult,
  recordWordMistakes,
  type MistakeType,
} from '@/utils/exercises/userStats';
import { useAudioRecorder } from '@/hooks/exercises/useAudioRecorder';
import { useTafsir } from '@/hooks/exercises/useTafsir';
import { useTafsirGroups } from '@/hooks/exercises/useTafsirGroups';
import { useIbnKathir } from '@/hooks/exercises/useIbnKathir';
import { useAsbab } from '@/hooks/exercises/useAsbab';
import { prefetchSpeech, useSpeech } from '@/hooks/exercises/useSpeech';
import Link from 'next/link';

export default function PracticePage() {
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  // La récitation (micro + détection de fautes) a sa propre interface,
  // sans les pages Mushaf ni la machine à états des autres exercices.
  if (exerciseId === 'recitation') {
    return <RecitationPractice />;
  }
  return <MushafPractice />;
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
            className="block text-center my-2 text-[#2d5016]"
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
              ? 'bg-[#c9a959]/35 rounded px-0.5 transition-colors'
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

  // Double page côte à côte forcée pour tous les exercices (Hifz utilise singlePage et ignore l'orientation)
  const orientation: Orientation = 'landscape';
  const audio = useAudio();
  const [initialized, setInitialized] = useState(false);
  // Dernier verset joué à l'audio dans le tour courant : permet de le faire
  // répéter à tout moment (bouton dans le bandeau), à toutes les étapes.
  const [lastAudioVerse, setLastAudioVerse] = useState<VersePosition | null>(null);
  // Mode lecture plein écran (Hifz) : masque les barres du haut pour maximiser la lecture.
  const [readingMode, setReadingMode] = useState(false);
  const isHifz = exerciseId === 'hifz';
  const fullscreen = isHifz && readingMode;

  // Hifz : fautes déclarées en Récitation, transférées ici (une couleur par type).
  const [showMistakes, setShowMistakes] = useState(true);
  const [mistakeWords, setMistakeWords] = useState<Map<string, MistakeType>>(new Map());
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHifz) setMistakeWords(getMistakeWordMarks(getCurrentUser()));
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

  // Hifz : mode « marquer mes fautes » — taper les mots ratés, puis choisir le type.
  const [markingMode, setMarkingMode] = useState(false);
  const [selWords, setSelWords] = useState<
    Map<string, { verseKey: string; position: number; page: number }>
  >(new Map());

  const declareHifzMistakes = (type: MistakeType) => {
    const user = getCurrentUser();
    const at = new Date().toISOString();
    recordWordMistakes(
      user,
      Array.from(selWords.values()).map((w) => ({ ...w, type, at }))
    );
    setMistakeWords(getMistakeWordMarks(user));
    setSelWords(new Map());
  };

  // Marques affichées en Hifz : fautes persistées (si visibles) + sélection en cours.
  const hifzWordMarks = useMemo(() => {
    if (!isHifz) return undefined;
    const marks = new Map<string, string>();
    if (showMistakes) for (const [k, v] of mistakeWords) marks.set(k, v);
    for (const k of selWords.keys()) marks.set(k, 'selected');
    return marks;
  }, [isHifz, showMistakes, mistakeWords, selWords]);

  // Traduction Hamidullah (Hifz) : affichée seulement au tap sur un verset, en popover.
  const { translations, loading: translationLoading, load: loadTranslations } = useTranslation();
  const { data: quranUnits } = useQuranUnits();
  // popover = verset ouvert + côté du panneau (moitié OPPOSÉE à la page du verset).
  const [popover, setPopover] = useState<{ verseKey: string; side: 'left' | 'right' } | null>(null);

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
      maxRounds: nParam ? Number(nParam) || undefined : undefined,
      identifyPosition: (identifyParam ?? undefined) as VersePositionType | undefined,
      revealAfter: parsePositions(revealParam),
      showPositions: parsePositions(showParam),
      direction: (dirParam ?? undefined) as 'forward' | 'backward' | undefined,
      audioSeconds: audioSeconds > 0 ? audioSeconds : undefined,
      revealFraction: fracParam >= 1 && fracParam <= 6 ? fracParam : undefined,
      answerMode,
      revealTimeout: revealTimeout > 0 ? revealTimeout : undefined,
    }).then(() => {
      setInitialized(true);
    });
  }, [exerciseId, startPage, endPage, nParam, identifyParam, revealParam, showParam, dirParam, audioSeconds, fracParam, answerMode, revealTimeout, initialize, initialized]);

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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentStep?.type === 'listening' && currentStep.targetVerse) {
      audioPlayRef.current(currentStep.targetVerse, audioSeconds > 0 ? audioSeconds : undefined);
      setLastAudioVerse(currentStep.targetVerse);
    }
  }, [currentStep, audioSeconds]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const asksFeedback =
    exerciseId === 'audio-quiz' ||
    exerciseId === 'sequential' ||
    exerciseId === 'page-number' ||
    exerciseId === 'verse-start';
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
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">Exercice non trouvé</p>
          <Link href="/exercises" className="text-[#2d5016] underline">
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
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#2d5016] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a7c23]">Chargement...</p>
        </div>
      </div>
    );
  }

  // Completed state
  if (state.status === 'completed') {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016] text-center">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-2">Terminé !</h2>
          <p className="text-[#4a7c23] mb-4">
            Vous avez terminé {toArabicNumbers(state.progress.totalRounds)} question
            {state.progress.totalRounds > 1 ? 's' : ''}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                reset();
                setInitialized(false);
              }}
              className="px-4 py-2 bg-[#c9a959] hover:bg-[#b89848] text-white rounded-lg"
            >
              Recommencer
            </button>
            <Link
              href="/exercises"
              className="px-4 py-2 bg-[#2d5016] hover:bg-[#4a7c23] text-white rounded-lg"
            >
              Autres exercices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Header avec progression */}
      {!fullscreen && (
        <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
          <Link
            href={`/exercises/${exerciseId}/setup`}
            className="text-sm hover:underline"
          >
            ← Retour
          </Link>
          <span className="text-sm font-medium">
            {exerciseId === 'hifz' ? (
              <>
                Pages {toArabicNumbers(pagePair.rightPage)}–{toArabicNumbers(pagePair.leftPage)}
              </>
            ) : (
              <>
                Page {toArabicNumbers(state.progress.currentPage)} • Question{' '}
                {toArabicNumbers(state.progress.pagesCompleted + 1)}/
                {toArabicNumbers(state.progress.totalRounds)}
              </>
            )}
          </span>
          {isHifz ? (
            <button
              type="button"
              onClick={() => setReadingMode(true)}
              aria-label="Mode lecture plein écran"
              className="flex items-center gap-1 text-xs font-semibold text-[#c9a959] hover:text-[#fdfaf3] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
              Plein écran
            </button>
          ) : (
            <span className="text-xs opacity-75">{exercise?.name}</span>
          )}
        </div>
      )}

      {/* Overlay avec message - sous la barre verte */}
      {currentStep && !fullscreen && (
        <div className="flex-none bg-[#2d5016]/90 text-white px-4 py-1 flex items-center justify-center gap-2">
          {audio.isPlaying && (
            <div className="flex gap-0.5">
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          )}
          <span className="text-base font-medium">
            {currentStep.message.title}
          </span>
          <span className="text-[#c9a959] text-sm">
            {currentStep.message.subtitle}
          </span>
          {lastAudioVerse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                audio.play(lastAudioVerse, audioSeconds > 0 ? audioSeconds : undefined);
              }}
              aria-label="Faire répéter le verset"
              className="ml-1 w-7 h-7 rounded-full flex items-center justify-center bg-[#c9a959]/20 text-[#c9a959] hover:bg-[#c9a959]/35 active:scale-95 transition-all flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {timedStep && countdown > 0 && (
            <span className="ml-1 flex items-center gap-1 text-[#c9a959] text-sm font-bold tabular-nums flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2 2" />
                <path d="M5 3 2 6" />
                <path d="m22 6-3-3" />
              </svg>
              {countdown}s
            </span>
          )}
        </div>
      )}

      {/* Boutons de niveau Hifz (uniquement pour l'exercice Hifz, masqués en plein écran) */}
      {isHifz && !fullscreen && (
        <div className="flex-none bg-[#2d5016]/95 text-white px-2 py-2 flex items-center justify-center gap-1 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowThemes((t) => !t);
            }}
            title="Surligner les versets partageant le même tafsir (thèmes)"
            className={`h-8 px-2.5 rounded-md text-xs font-bold transition-colors mr-1 border ${
              showThemes
                ? 'bg-[#7a8b3e] text-white border-[#7a8b3e] shadow-md'
                : 'bg-[#2d5016] text-[#c9a959] border-[#4a7c23] hover:bg-[#3e6b1d]'
            }`}
          >
            Thèmes
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMarkingMode((m) => {
                if (!m) setPopover(null);
                else setSelWords(new Map());
                return !m;
              });
            }}
            title="Marquer mes fautes : touchez les mots ratés, puis choisissez le type"
            className={`h-8 px-2.5 rounded-md text-xs font-bold transition-colors mr-1 border ${
              markingMode
                ? 'bg-[#c9a959] text-[#2d5016] border-[#c9a959] shadow-md'
                : 'bg-[#2d5016] text-[#c9a959] border-[#4a7c23] hover:bg-[#3e6b1d]'
            }`}
          >
            ✍ Marquer
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMistakes((s) => !s);
            }}
            title="Afficher/masquer les fautes déclarées"
            className={`h-8 px-2.5 rounded-md text-xs font-bold transition-colors mr-2 border ${
              showMistakes && mistakeWords.size > 0
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-[#2d5016] text-[#c9a959] border-[#4a7c23] hover:bg-[#3e6b1d]'
            }`}
          >
            Fautes {mistakeWords.size > 0 ? `(${toArabicNumbers(mistakeWords.size)})` : ''}
          </button>
          <span className="text-xs uppercase tracking-wide text-[#c9a959] mr-2">Niveau</span>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
            <button
              key={lvl}
              onClick={(e) => {
                e.stopPropagation();
                setHifzLevel(lvl);
              }}
              className={`min-w-[36px] h-8 px-2 rounded-md text-sm font-bold transition-colors ${
                hifzLevel === lvl
                  ? 'bg-[#c9a959] text-[#2d5016] shadow-md'
                  : 'bg-[#2d5016] hover:bg-[#3e6b1d] text-[#c9a959] border border-[#4a7c23]'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}

      {/* Zone Mushaf */}
      <div className="flex-1 min-h-0 relative" onClick={handleMushafClick}>
        {/* Bouton discret pour quitter le plein écran (Hifz) */}
        {fullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReadingMode(false);
            }}
            aria-label="Quitter le plein écran"
            className="absolute right-2 top-2 z-30 w-10 h-10 rounded-full flex items-center justify-center bg-[#2d5016]/70 text-[#fdfaf3] hover:bg-[#2d5016] shadow-lg border border-[#c9a959]/40 active:scale-95 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
        )}
        <MushafDoublePage
          leftPageVerses={leftPageVerses}
          rightPageVerses={rightPageVerses}
          pagePair={pagePair}
          orientation={orientation}
          revealedVerses={visibleVerses}
          visibleVerses={visibleVerses}
          isBlurred={isBlurred}
          maskAll={maskAll}
          wordMarks={hifzWordMarks}
          verseThemes={isHifz && showThemes ? tafsirGroups : null}
          loading={loading}
          singlePage={singlePage}
          currentPage={singlePage ? displayedPage : undefined}
          hifzLevel={exerciseId === 'hifz' ? hifzLevel : undefined}
          revealFraction={currentStep?.ui.revealFraction}
          onTap={handleTap}
        />

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
            <div className="bg-[#fdfaf3]/[0.97] backdrop-blur border-2 border-[#c9a959] rounded-3xl shadow-2xl px-6 py-8 w-full max-w-md text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#c9a959] mb-3">
                Question
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-[#2d5016] leading-snug mb-2">
                {currentStep.message.title}
              </p>
              <p className="text-sm text-[#7a8b3e] mb-6">{currentStep.message.subtitle}</p>

              {lastAudioVerse && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    audio.play(lastAudioVerse, audioSeconds > 0 ? audioSeconds : undefined);
                  }}
                  className="mx-auto mb-5 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20 font-bold text-sm active:scale-95 transition-all"
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
                        <span className="font-bold tabular-nums text-[#2d5016] text-3xl">
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
                  <div className="text-5xl font-bold tabular-nums text-[#2d5016] leading-none">
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
            <div className="flex items-center gap-2 bg-[#fdfaf3]/95 backdrop-blur border-2 border-[#c9a959] rounded-2xl px-3 py-2 shadow-lg">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#c9a959]">
                Ma récitation
              </span>
              <audio controls src={recorder.audioUrl} className="h-8 w-52" />
              <button
                type="button"
                onClick={recorder.clear}
                aria-label="Fermer le lecteur"
                className="w-8 h-8 rounded-full bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20 flex items-center justify-center active:scale-95 transition-all"
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
              className="bg-[#fdfaf3]/95 backdrop-blur border-2 border-red-300 rounded-2xl shadow-lg px-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-600">
                  {toArabicNumbers(selWords.size)} mot{selWords.size > 1 ? 's' : ''} — type de faute ?
                </span>
                <button
                  type="button"
                  onClick={() => setSelWords(new Map())}
                  className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                >
                  Annuler
                </button>
              </div>
              {getCurrentUser() ? (
                <div className="flex gap-1.5 flex-wrap">
                  {MISTAKE_TYPE_META.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => declareHifzMistakes(t.value)}
                      className="flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold bg-white border-2 active:scale-95 transition-all"
                      style={{ borderColor: t.color, color: t.color }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = t.color;
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff';
                        e.currentTarget.style.color = t.color;
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
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
              <div className="flex items-center gap-2.5 bg-[#fdfaf3]/95 backdrop-blur border-2 border-red-300 rounded-full pl-4 pr-1.5 py-1.5 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold tabular-nums text-[#2d5016] text-lg">
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
              <div className="flex items-center gap-2 bg-[#fdfaf3]/95 backdrop-blur border-2 border-[#c9a959] rounded-2xl px-3 py-2 shadow-lg flex-wrap justify-center">
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
                          ? 'bg-[#2d5016] text-[#fdfaf3]'
                          : 'bg-white border border-[#c9a959]/40 text-[#4a7c23]'
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
                  className="w-8 h-8 rounded-full bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20 flex items-center justify-center active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-full px-4 py-2.5 shadow-lg font-bold text-sm active:scale-95 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
                S&apos;enregistrer
              </button>
            )}
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
              disabled={!canFlipPrev}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                flipPair('prev');
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipPrev
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
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
              disabled={!canFlipNext}
              onClick={(e) => {
                e.stopPropagation();
                setPopover(null);
                flipPair('next');
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipNext
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </>
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
                  ? 'bg-[#2d5016] text-[#fdfaf3]'
                  : 'bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20'
              }`}
            >
              {speech.loading && speakingSection === section ? (
                <span className="w-4 h-4 border-2 border-[#fdfaf3] border-t-transparent rounded-full animate-spin" />
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
            <span className="text-[12px] font-bold uppercase tracking-widest text-[#c9a959]">
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
              className="text-[13px] font-semibold text-[#4a7c23] underline mb-1.5"
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
            className={`absolute inset-y-0 z-30 w-1/2 bg-[#fdfaf3]/[0.98] backdrop-blur overflow-y-auto overscroll-contain shadow-[0_0_40px_rgba(45,80,22,0.3)] ${
              popover.side === 'left'
                ? 'left-0 border-r-2 border-[#c9a959]'
                : 'right-0 border-l-2 border-[#c9a959]'
            }`}
          >
            <div className="px-5 pt-3 pb-8 max-w-xl mx-auto">
              {/* Entête : référence du verset + fermeture */}
              <div className="sticky top-0 -mx-5 px-5 py-2 bg-[#fdfaf3]/95 backdrop-blur z-10 flex items-center justify-between gap-2 border-b border-[#c9a959]/30 mb-2">
                <div className="text-lg font-bold text-[#2d5016] flex items-center gap-2 flex-wrap min-w-0">
                  <span>
                    {sNum}:{aNum}
                    {chapter ? ` · ${chapter.name_simple}` : ''}
                  </span>
                  {chapter && (
                    <span
                      className="text-[#7a8b3e]"
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
                  className="flex-none w-9 h-9 rounded-full flex items-center justify-center bg-[#2d5016]/10 text-[#2d5016] hover:bg-[#2d5016]/20 active:scale-95 transition"
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
              <div className="border-t border-[#c9a959]/30 mt-2" />
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
                  <div className="border-t border-[#c9a959]/30 mt-2" />
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
              <div className="border-t border-[#c9a959]/30 mt-2" />
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
                    className="mt-1 mb-1 text-[13px] font-semibold text-[#7a5d2c] bg-[#c9a959]/15 border border-[#c9a959]/30 rounded-full px-3 py-1.5 active:scale-95 transition"
                  >
                    {showAsbabArabic ? 'Masquer le texte original (arabe)' : 'Texte original (arabe)'}
                  </button>
                  {showAsbabArabic && (
                    <div className="space-y-2 pb-1 border-t border-[#c9a959]/20 pt-2">
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
          <div className="bg-[#fdfaf3] border-2 border-[#c9a959] rounded-2xl shadow-xl p-5 w-[min(90vw,340px)] text-center">
            <p className="text-lg font-bold text-[#2d5016] mb-1">Avez-vous trouvé ?</p>
            <p className="text-xs text-gray-500 mb-4">
              Votre réponse oriente les prochaines questions vers ce que vous ratez.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => answerFound(true)}
                className="flex-1 py-3 rounded-xl bg-[#2d5016] hover:bg-[#4a7c23] text-white font-bold active:scale-95 transition-all"
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
