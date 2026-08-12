'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Orientation, PageVerses, PagePair, VersePosition } from '@/types';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { getAudioUrl, fromGlobalAyahNumber, SURAH_START_AYAH, TOTAL_AYAHS } from '@/utils/ayahMapping';
import { getVerseRoots, getVersePageMap } from '@/utils/vocab/morphology';
import { lexiconMatchSets, matchesLexicon, type LexiconMatch } from '@/utils/vocab/vocabStore';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { useVerseMap } from '@/hooks/useVerseMap';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';
import { resolveFrenchEdition, frenchAyahUrls } from '@/utils/frenchRecitation';
import { loadHizbQuarters } from '@/utils/quranBounds';
import {
  buildSelection,
  describeSelection,
  groupByTheme,
  DEFAULT_CONFIG,
  type PlayConfig,
  type SelVerse,
} from '@/utils/exercises/lecturePlaylist';
import { fetchIbnKathir, useIbnKathir } from '@/hooks/exercises/useIbnKathir';
import { fetchTTS } from '@/hooks/exercises/useSpeech';
import { useAudioRecorder } from '@/hooks/exercises/useAudioRecorder';
import { useTafsirGroups } from '@/hooks/exercises/useTafsirGroups';
import {
  getCurrentUser,
  getMistakeWordMarks,
  recordWordMistakes,
  MISTAKE_TYPE_META,
  type MistakeType,
} from '@/utils/exercises/userStats';
import { playBeep } from '@/utils/beep';
import MushafDoublePage from '@/components/MushafDoublePage';
import WordCard from '@/components/vocab/WordCard';
import PlaybackConfig from '@/components/exercises/LecturePlaybackConfig';
import { toArabicNumbers } from '@/utils/arabicNumbers';

function pairOf(page: number): PagePair {
  const right = page % 2 === 1 ? page : page - 1;
  return { rightPage: Math.max(1, right), leftPage: Math.min(604, Math.max(1, right) + 1) };
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

// Réglages du comportement de l'appui long (persistés dans localStorage).
const LP_SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const LP_PAGES = [2, 3, 4, 5, 6]; // nombre de pages lues en portée « pages »
type LongPressScope = 'verse' | 'half' | 'page' | 'pages';
interface LongPressConfig {
  rate: number;
  scope: LongPressScope;
  pages: number; // nombre de pages lues quand scope === 'pages'
  french: boolean; // réciter aussi la traduction française
  tafsir: boolean; // réciter aussi le tafsir Ibn Kathir
  loop: boolean; // écouter la sélection en boucle
  loopDelay: number; // secondes d'attente avant de relancer la boucle (1..500)
}
const LP_DEFAULT: LongPressConfig = { rate: 2, scope: 'half', pages: 2, french: false, tafsir: false, loop: false, loopDelay: 3 };
const LP_KEY = 'almuraja3a:lecture:longpress';

function loadLongPressConfig(): LongPressConfig {
  if (typeof window === 'undefined') return LP_DEFAULT;
  try {
    const raw = window.localStorage.getItem(LP_KEY);
    if (!raw) return LP_DEFAULT;
    return { ...LP_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return LP_DEFAULT;
  }
}

// Étape d'une lecture par thème : un verset (audio arabe) ou le tafsir Ibn Kathir
// d'un thème (synthèse vocale française).
type Step =
  | { type: 'ayah'; verseKey: string; page: number; globalNumber: number; themeKey: string }
  | { type: 'tafsir'; verseKey: string; page: number };

// Cache de la carte verset → id de groupe/thème (Ibn Kathir).
let themeGroups: Record<string, number> | null = null;
async function loadThemeGroups(): Promise<Record<string, number>> {
  if (themeGroups) return themeGroups;
  try {
    themeGroups = await fetch('/ibn-kathir-groups.json').then((r) => r.json());
  } catch {
    themeGroups = {};
  }
  return themeGroups ?? {};
}

/**
 * Mode LECTURE : lire le Mushaf sur une plage, écouter la récitation Husary avec
 * un CONFIGURATEUR complet (plage verset/page/hizb/juz, répétition par verset,
 * répétition de la sélection, français entre chaque verset), voir surlignés les
 * mots du lexique, et — en mode « Ajouter » — toucher un mot (fiche + occurrences
 * déjà rencontrées avant la page courante).
 */
export default function LecturePractice() {
  const params = useSearchParams();
  // Page de départ (page / sourate / hizb / juz résolus en page côté setup).
  // La Lecture n'est PLUS bloquée à une plage : navigation libre sur tout le Mushaf.
  const storedPage =
    typeof window !== 'undefined' ? Number(window.localStorage.getItem('almuraja3a:lecture:last-page')) : 0;
  const startPage = Number(params.get('start')) || storedPage || 2;

  const { data: units } = useQuranUnits();
  const { verseMap } = useVerseMap();
  const recorder = useAudioRecorder(); // enregistrement micro + réécoute

  const [page, setPage] = useState(startPage);
  // Mémorise la dernière page lue : la sidebar « Lecture » rentre directement dedans.
  useEffect(() => {
    try {
      window.localStorage.setItem('almuraja3a:lecture:last-page', String(page));
    } catch {}
  }, [page]);
  const [left, setLeft] = useState<PageVerses | null>(null);
  const [right, setRight] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<Map<string, string>>(new Map());
  const [lexicon, setLexicon] = useState<LexiconMatch>({ lemmas: new Set(), roots: new Set(), forms: new Set() });
  const lexSize = lexicon.lemmas.size + lexicon.roots.size + lexicon.forms.size;
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(2);
  const [currentVerse, setCurrentVerse] = useState<string | null>(null);
  // Appui long : surligne en jaune tous les versets de la portée en cours d'écoute.
  const [halfPageHighlight, setHalfPageHighlight] = useState<Set<string>>(new Set());
  // Réglages de l'appui long (vitesse, portée, traduction, tafsir).
  const [lpConfig, setLpConfig] = useState<LongPressConfig>(LP_DEFAULT);
  const [showLpConfig, setShowLpConfig] = useState(false);
  const lpConfigRef = useRef<LongPressConfig>(LP_DEFAULT);
  lpConfigRef.current = lpConfig;
  const [captureMode, setCaptureMode] = useState(false);
  // Visibilité : couleurs du lexique + thèmes de tafsir (Ibn Kathir).
  const [showLexicon, setShowLexicon] = useState(true);
  const [showThemes, setShowThemes] = useState(false);
  const tafsirGroups = useTafsirGroups(showThemes);
  // Saisie des fautes (comme en Hifz) : mode marquage + sélection + fautes persistées.
  const [markingMode, setMarkingMode] = useState(false);
  const [selWords, setSelWords] = useState<Map<string, { verseKey: string; position: number; page: number }>>(new Map());
  const [mistakeWords, setMistakeWords] = useState<Map<string, MistakeType>>(new Map());
  const [showMistakes, setShowMistakes] = useState(true);
  const [selected, setSelected] = useState<{ verseKey: string; position: number; side: 'left' | 'right'; page: number } | null>(null);
  const [showTrans, setShowTrans] = useState(false);
  const [trans, setTrans] = useState<Record<string, string> | null>(null);
  // Menu d'actions au clic sur un verset (hors mode « Ajouter ») + coordonnées.
  const [verseMenu, setVerseMenu] = useState<{ verseKey: string; x: number; y: number } | null>(null);
  // Layer d'info verset : traduction ou tafsir Ibn Kathir.
  const [verseLayer, setVerseLayer] = useState<{ verseKey: string; tab: 'trans' | 'tafsir' } | null>(null);
  const [tafsirPlaying, setTafsirPlaying] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tafsirAudioRef = useRef<HTMLAudioElement | null>(null);
  // Réécoute de l'enregistrement micro : lecteur + vitesse (auto ×1,5).
  const recPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [recRate, setRecRate] = useState(1.5);
  const lastRecUrl = useRef<string | null>(null); // pour lancer la réécoute une seule fois
  // Configurateur de lecture.
  const [showConfig, setShowConfig] = useState(false);
  // Panneau de pilotage gauche (ouvert en overlay sur petit écran).
  const [panelOpen, setPanelOpen] = useState(false);
  const [gotoPage, setGotoPage] = useState('');
  const [config, setConfig] = useState<PlayConfig>({
    ...DEFAULT_CONFIG,
    selMode: 'page',
    unitStart: startPage,
    unitEnd: startPage,
  });
  const [sessionActive, setSessionActive] = useState(false);
  const [frAvailable, setFrAvailable] = useState<boolean | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false); // synthèse Ibn Kathir en préparation

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rateRef = useRef(2); // vitesse courante lue dans les callbacks audio
  // Détection de l'appui long sur un verset (écoute de la demi-page).
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number; page: number; verseKey: string } | null>(null);
  const longPressFired = useRef(false);
  // Feuilletage par glissement horizontal (drag suivant le doigt + transition).
  const flipWrapRef = useRef<HTMLDivElement | null>(null); // conteneur translaté (impératif)
  const mushafAreaRef = useRef<HTMLDivElement | null>(null); // zone Mushaf (écoute du wheel trackpad)
  const swipe = useRef({ startX: 0, startY: 0, dx: 0, active: false, dragging: false, w: 0, animating: false });
  const swipedFired = useRef(false); // un glissement vient d'avoir lieu → pas de clic
  // Feuilletage au trackpad (deux doigts = événements wheel horizontaux).
  const wheelAccum = useRef(0);
  const wheelCooldown = useRef(false);
  const wheelClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheelRef = useRef<(e: WheelEvent) => void>(() => {});
  const phaseRef = useRef<'ar' | 'fr'>('ar'); // phase du verset courant
  const loopDelayRef = useRef(0); // secondes d'attente avant de relancer la boucle
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frEditionRef = useRef<string | null>(null); // édition audio FR découverte
  // Session de lecture en cours.
  const selRef = useRef<SelVerse[]>([]);
  const cfgRef = useRef<PlayConfig>(config);
  const vIdxRef = useRef(0); // index du verset dans la sélection
  const repRef = useRef(0); // répétition courante du verset (0-based)
  const passRef = useRef(0); // passage courant sur toute la sélection (0-based)
  // Session PAR THÈME : suite d'étapes (versets puis tafsir Ibn Kathir lu).
  const stepsRef = useRef<Step[]>([]);
  const sIdxRef = useRef(0);

  const pair = pairOf(page);
  // Navigation libre sur tout le Mushaf (pages de droite : 1 → 603).
  const canPrev = pair.rightPage > 1;
  const canNext = pair.rightPage < 603;

  /* eslint-disable react-hooks/set-state-in-effect */
  // Racines du lexique (rechargeable après ajout d'un mot).
  useEffect(() => {
    setLexicon(lexiconMatchSets());
    setLpConfig(loadLongPressConfig());
    setMistakeWords(getMistakeWordMarks(getCurrentUser()));
  }, []);

  // Persiste les réglages d'appui long.
  useEffect(() => {
    try {
      window.localStorage.setItem(LP_KEY, JSON.stringify(lpConfig));
    } catch {
      /* quota — silencieux */
    }
  }, [lpConfig]);

  // Fin d'enregistrement → réécoute automatique à ×1,5.
  useEffect(() => {
    const url = recorder.audioUrl;
    if (!url) {
      lastRecUrl.current = null;
      return;
    }
    if (url === lastRecUrl.current) return;
    lastRecUrl.current = url;
    setRecRate(1.5);
    const t = setTimeout(() => {
      const el = recPlayerRef.current;
      if (el) {
        el.playbackRate = 1.5;
        el.play().catch(() => {});
      }
    }, 120);
    return () => clearTimeout(t);
  }, [recorder.audioUrl]);

  // Charge les pages quand la double page change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPageVerses(pair.leftPage), fetchPageVerses(pair.rightPage)])
      .then(([l, r]) => {
        if (cancelled) return;
        setLeft(l);
        setRight(r);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pair.leftPage, pair.rightPage]);

  // Marques du lexique : mots dont la racine figure dans le lexique.
  useEffect(() => {
    let cancelled = false;
    const verseKeys = [...(right?.verses ?? []), ...(left?.verses ?? [])].map((v) => v.verseKey);
    if (lexSize === 0 || verseKeys.length === 0) {
      setMarks(new Map());
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
      if (!cancelled) setMarks(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [right, left, lexicon, lexSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    rateRef.current = rate;
    // Ne change la vitesse que pour l'arabe : la voix française reste à ×1.
    if (audioRef.current && phaseRef.current !== 'fr') audioRef.current.playbackRate = rate;
  }, [rate]);

  // Traduction Hamidullah (chargée à la 1re activation).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const needTrans = showTrans || verseLayer?.tab === 'trans';
    if (!needTrans || trans) return;
    fetch('/qcf-data/translation-hamidullah.fr.json')
      .then((r) => r.json())
      .then((d) => setTrans(d))
      .catch(() => {});
  }, [showTrans, verseLayer, trans]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Suivi de l'état plein écran : si le navigateur sort du plein écran natif
  // (touche Échap), on referme aussi notre plein écran CSS.
  useEffect(() => {
    const onFs = () => {
      const d = document as Document & { webkitFullscreenElement?: Element };
      if (!d.fullscreenElement && !d.webkitFullscreenElement) setIsFs(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  // Feuilletage au trackpad : écouteur wheel NON passif (pour pouvoir bloquer la
  // navigation arrière du navigateur). Le handler à jour est lu via onWheelRef.
  useEffect(() => {
    const el = mushafAreaRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => onWheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Media Session : indique au navigateur qu'une lecture média est en cours →
  // l'audio continue quand l'app passe en arrière-plan (mobile) + contrôles sur
  // l'écran verrouillé. Les handlers sont enregistrés une fois.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action non supportée */
      }
    };
    set('play', () => {
      audioRef.current?.play().then(() => setPlaying(true)).catch(() => {});
    });
    set('pause', () => {
      audioRef.current?.pause();
      setPlaying(false);
    });
    set('stop', () => stop());
    return () => {
      (['play', 'pause', 'stop'] as MediaSessionAction[]).forEach((a) => set(a, null));
    };
  }, []);

  // Métadonnées + état de lecture (pour l'écran verrouillé / centre de contrôle).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (currentVerse && typeof MediaMetadata !== 'undefined') {
      try {
        ms.metadata = new MediaMetadata({
          title: `Verset ${currentVerse}`,
          artist: 'Mahmoud Al-Husary',
          album: 'almuraja3a — Lecture',
        });
      } catch {
        /* ignore */
      }
    }
    ms.playbackState = playing ? 'playing' : sessionActive ? 'paused' : 'none';
  }, [currentVerse, playing, sessionActive]);

  // Tafsir du layer (Ibn Kathir français) — chargé à l'ouverture de l'onglet.
  const { text: tafsirText, loading: tafsirTextLoading } = useIbnKathir(
    verseLayer?.tab === 'tafsir' ? verseLayer.verseKey : null
  );

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      tafsirAudioRef.current?.pause();
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, []);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.playbackRate = rateRef.current;
      a.preservesPitch = true;
      (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      a.onloadedmetadata = () => {
        a.playbackRate = phaseRef.current === 'fr' ? 1 : rateRef.current;
      };
      audioRef.current = a;
    }
    return audioRef.current;
  }

  // ---- Moteur de lecture ----

  function followPage(p: number) {
    const rp = p % 2 === 1 ? p : p - 1;
    setPage((cur) => (cur === rp ? cur : rp));
  }

  function playVerseArabic() {
    const item = selRef.current[vIdxRef.current];
    if (!item) {
      stop();
      return;
    }
    phaseRef.current = 'ar';
    setCurrentVerse(item.verseKey);
    followPage(item.page);
    const a = ensureAudio();
    a.src = getAudioUrl(item.globalNumber);
    a.playbackRate = rateRef.current;
    a.onended = onArabicEnded;
    a.onerror = onArabicEnded; // en cas d'échec réseau on n'attend pas
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function onArabicEnded() {
    const cfg = cfgRef.current;
    if (repRef.current + 1 < cfg.verseRepeat) {
      repRef.current += 1;
      playVerseArabic();
      return;
    }
    if (cfg.french && frEditionRef.current) {
      playVerseFrench();
      return;
    }
    advanceVerse();
  }

  function playVerseFrench() {
    const item = selRef.current[vIdxRef.current];
    const edition = frEditionRef.current;
    if (!item || !edition) {
      advanceVerse();
      return;
    }
    phaseRef.current = 'fr';
    const a = ensureAudio();
    a.playbackRate = 1;
    const urls = frenchAyahUrls(edition, item.globalNumber);
    let tried = 0;
    const attempt = () => {
      if (tried >= urls.length) {
        advanceVerse();
        return;
      }
      a.src = urls[tried++];
      a.play().catch(() => attempt());
    };
    a.onended = () => advanceVerse();
    a.onerror = () => attempt();
    attempt();
  }

  // Relance une boucle après le délai configuré (immédiat si délai = 0).
  function restartLoop(play: () => void) {
    const delay = loopDelayRef.current;
    if (delay > 0) {
      loopTimerRef.current = setTimeout(() => {
        loopTimerRef.current = null;
        playBeep();
        play();
      }, delay * 1000);
    } else {
      playBeep();
      play();
    }
  }

  function advanceVerse() {
    const cfg = cfgRef.current;
    const sel = selRef.current;
    repRef.current = 0;
    phaseRef.current = 'ar';
    if (vIdxRef.current + 1 < sel.length) {
      vIdxRef.current += 1;
      playBeep(); // transition d'un verset à l'autre
      playVerseArabic();
      return;
    }
    // Fin de la sélection : rejoue si demandé (0 = infini).
    passRef.current += 1;
    if (cfg.selectionRepeat === 0 || passRef.current < cfg.selectionRepeat) {
      vIdxRef.current = 0;
      restartLoop(playVerseArabic);
      return;
    }
    stop();
  }

  // ---- Moteur PAR THÈME (versets + tafsir Ibn Kathir lu) ----

  // Précharge (tafsir + synthèse vocale) EN TÂCHE DE FOND pendant la récitation
  // arabe → l'enchaînement est fluide quand on arrive à l'étape tafsir (cache).
  function prefetchTafsir(verseKey: string) {
    fetchIbnKathir(verseKey)
      .then((t) => (t ? fetchTTS(t) : null))
      .catch(() => {});
  }

  function playStep() {
    const step = stepsRef.current[sIdxRef.current];
    if (!step) {
      stop();
      return;
    }
    followPage(step.page);
    setCurrentVerse(step.verseKey);
    const a = ensureAudio();
    if (step.type === 'ayah') {
      phaseRef.current = 'ar';
      setTafsirLoading(false);
      prefetchTafsir(step.themeKey); // prépare la synthèse du thème pendant les versets
      a.src = getAudioUrl(step.globalNumber);
      a.playbackRate = rateRef.current;
      a.onended = onStepArabicEnded;
      a.onerror = onStepArabicEnded;
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }
    // Tafsir Ibn Kathir du thème → synthèse vocale française.
    phaseRef.current = 'fr';
    setTafsirLoading(true);
    const stepKey = step.verseKey;
    fetchIbnKathir(stepKey)
      .then((text) => (text ? fetchTTS(text) : null))
      .then((url) => {
        // Une étape plus récente a pu prendre la main entre-temps.
        if (stepsRef.current[sIdxRef.current] !== step) return;
        setTafsirLoading(false);
        if (!url) {
          nextStep();
          return;
        }
        a.src = url;
        a.playbackRate = 1;
        a.onended = nextStep;
        a.onerror = nextStep;
        a.play().then(() => setPlaying(true)).catch(() => nextStep());
      })
      .catch(() => {
        setTafsirLoading(false);
        nextStep();
      });
  }

  // Après l'arabe d'une étape 'ayah' : joue la traduction FR si demandée.
  function onStepArabicEnded() {
    const cfg = cfgRef.current;
    const step = stepsRef.current[sIdxRef.current];
    if (cfg.french && frEditionRef.current && step && step.type === 'ayah') {
      playStepFrench(step.globalNumber);
      return;
    }
    nextStep();
  }

  function playStepFrench(globalNumber: number) {
    const edition = frEditionRef.current;
    if (!edition) {
      nextStep();
      return;
    }
    phaseRef.current = 'fr';
    const a = ensureAudio();
    a.playbackRate = 1;
    const urls = frenchAyahUrls(edition, globalNumber);
    let tried = 0;
    const attempt = () => {
      if (tried >= urls.length) {
        nextStep();
        return;
      }
      a.src = urls[tried++];
      a.play().catch(() => attempt());
    };
    a.onended = () => nextStep();
    a.onerror = () => attempt();
    attempt();
  }

  function nextStep() {
    const cfg = cfgRef.current;
    if (sIdxRef.current + 1 < stepsRef.current.length) {
      sIdxRef.current += 1;
      // Bip uniquement à l'entrée dans un nouveau verset (pas avant le tafsir).
      if (stepsRef.current[sIdxRef.current]?.type === 'ayah') playBeep();
      playStep();
      return;
    }
    passRef.current += 1;
    if (cfg.selectionRepeat === 0 || passRef.current < cfg.selectionRepeat) {
      sIdxRef.current = 0;
      restartLoop(playStep);
      return;
    }
    stop();
  }

  function stop() {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    audioRef.current?.pause();
    setPlaying(false);
    setCurrentVerse(null);
    setSessionActive(false);
    setTafsirLoading(false);
    setHalfPageHighlight(new Set());
    vIdxRef.current = 0;
    repRef.current = 0;
    passRef.current = 0;
    sIdxRef.current = 0;
    stepsRef.current = [];
  }

  // Démarre la lecture d'une sélection explicite selon cfg (arabe, +français,
  // +tafsir par thème). Réutilisé par la config de lecture ET l'appui long.
  async function startPlayback(sel: SelVerse[], cfg: PlayConfig) {
    cfgRef.current = cfg;
    selRef.current = sel;
    vIdxRef.current = 0;
    repRef.current = 0;
    passRef.current = 0;
    sIdxRef.current = 0;
    phaseRef.current = 'ar';
    setSessionActive(true);
    setShowConfig(false);

    // Résout l'édition FR avant de démarrer → la traduction du 1er verset n'est
    // jamais sautée (utile pour l'appui long qui ne contient parfois qu'un verset).
    if (cfg.french) {
      const id = await resolveFrenchEdition();
      frEditionRef.current = id;
      setFrAvailable(id !== null);
    }

    // Lecture PAR THÈME : versets d'un thème puis tafsir Ibn Kathir lu.
    if (cfg.byTheme) {
      const groups = await loadThemeGroups();
      const themes = groupByTheme(sel, groups);
      const steps: Step[] = [];
      for (const t of themes) {
        const themeKey = t[0].verseKey;
        for (const v of t) steps.push({ type: 'ayah', verseKey: v.verseKey, page: v.page, globalNumber: v.globalNumber, themeKey });
        steps.push({ type: 'tafsir', verseKey: themeKey, page: t[0].page });
      }
      stepsRef.current = steps;
      followPage(sel[0].page);
      playStep();
      return;
    }
    followPage(sel[0].page);
    playVerseArabic();
  }

  async function launch(cfg: PlayConfig) {
    const vpMap = await getVersePageMap();
    // Quarts de hizb : bornes exactes au verset pour hizb/juz/sourate.
    const quarters = await loadHizbQuarters();
    const sel = buildSelection(cfg, units, vpMap, quarters);
    if (sel.length === 0) return;
    loopDelayRef.current = 0; // la lecture principale boucle sans délai (comportement inchangé)
    setConfig(cfg);
    await startPlayback(sel, cfg);
  }

  // Plein écran robuste : on pilote toujours l'affichage en CSS (isFs) — qui
  // fonctionne partout, y compris iOS Safari où l'API Fullscreen sur un <div>
  // n'existe pas — et on tente en plus le plein écran natif si disponible.
  function toggleFullscreen() {
    if (isFs) {
      setIsFs(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = document as any;
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        try {
          const ex = d.exitFullscreen ?? d.webkitExitFullscreen;
          ex?.call(d)?.catch?.(() => {});
        } catch {
          /* ignore */
        }
      }
    } else {
      setIsFs(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = rootRef.current as any;
      const req = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
      if (el && req) {
        try {
          req.call(el)?.catch?.(() => {});
        } catch {
          /* le CSS prend le relais */
        }
      }
    }
  }

  // Lance la récitation depuis le verset choisi jusqu'à la fin de sa sourate.
  function readFromVerse(verseKey: string) {
    const [s, v] = verseKey.split(':').map(Number);
    const endGlobal = (s < 114 ? SURAH_START_AYAH[s + 1] : TOTAL_AYAHS + 1) - 1;
    const { verse: lastVerse } = fromGlobalAyahNumber(endGlobal);
    setVerseMenu(null);
    setVerseLayer(null);
    launch({
      ...cfgRef.current,
      selMode: 'verse',
      surahStart: s,
      verseStart: v,
      surahEnd: s,
      verseEnd: lastVerse,
      byTheme: false,
      french: false,
    });
  }

  // Appui long sur un verset : écoute selon les réglages (vitesse, portée,
  // traduction, tafsir, boucle). Portée = verset seul / demi-page (coupée au
  // verset du milieu, le signet rouge) / page entière / N pages (2→6 à partir du
  // verset). Les versets lus sont surlignés en jaune ; les pages tournent seules.
  async function readLongPress(pageNum: number, pressedVerseKey: string) {
    const pv = pageNum === pair.leftPage ? left : pageNum === pair.rightPage ? right : null;
    if (!pv || pv.verses.length === 0) return;
    const lpc = lpConfigRef.current;
    const pressedGlobal = pv.verses.find((v) => v.verseKey === pressedVerseKey)?.globalNumber ?? 0;

    let sel: SelVerse[] = [];
    const mapVerses = (verses: typeof pv.verses, p: number): SelVerse[] =>
      verses.map((v) => ({ verseKey: v.verseKey, globalNumber: v.globalNumber, page: p }));

    if (lpc.scope === 'verse') {
      const v = pv.verses.find((x) => x.verseKey === pressedVerseKey);
      sel = v ? mapVerses([v], pageNum) : [];
    } else if (lpc.scope === 'page') {
      sel = mapVerses(pv.verses, pageNum);
    } else if (lpc.scope === 'pages') {
      // Depuis le DÉBUT de la page (peu importe où l'on clique) jusqu'à N pages après.
      const n = Math.max(2, Math.min(6, lpc.pages || 2));
      const endPage = Math.min(604, pageNum + n - 1);
      const pageNums: number[] = [];
      for (let p = pageNum; p <= endPage; p++) pageNums.push(p);
      const pvs = await Promise.all(pageNums.map((p) => fetchPageVerses(p).catch(() => null)));
      const byVerse = new Map<string, SelVerse>();
      pvs.forEach((ppv, i) => {
        if (!ppv) return;
        for (const v of ppv.verses) {
          if (!byVerse.has(v.verseKey)) {
            byVerse.set(v.verseKey, { verseKey: v.verseKey, globalNumber: v.globalNumber, page: pageNums[i] });
          }
        }
      });
      sel = Array.from(byVerse.values()).sort((a, b) => a.globalNumber - b.globalNumber);
    } else {
      // Demi-page : coupée au verset du milieu (signet rouge). Clic au-dessus →
      // moitié haute ; au niveau/après → moitié basse.
      const middle = getMiddleVerse(pv, verseMap?.pages[pageNum] ?? null);
      const midGlobal = middle?.globalNumber ?? Infinity;
      const upper = pressedGlobal < midGlobal;
      sel = mapVerses(
        pv.verses.filter((v) => (upper ? v.globalNumber < midGlobal : v.globalNumber >= midGlobal)),
        pageNum
      );
    }
    if (sel.length === 0) return;

    stop();
    const cfg: PlayConfig = {
      ...DEFAULT_CONFIG,
      selMode: 'verse',
      verseRepeat: 1,
      selectionRepeat: lpc.loop ? 0 : 1, // 0 = boucle infinie
      french: lpc.french,
      byTheme: lpc.tafsir,
    };
    setRate(lpc.rate);
    rateRef.current = lpc.rate;
    // Délai avant de relancer la boucle (borné 1..500 s ; 0 = pas de boucle).
    loopDelayRef.current = lpc.loop ? Math.max(1, Math.min(500, Math.round(lpc.loopDelay) || 1)) : 0;
    setHalfPageHighlight(new Set(sel.map((s) => s.verseKey)));
    setVerseMenu(null);
    setSelected(null);
    void startPlayback(sel, cfg);
  }

  // Lecture/pause de la synthèse vocale du tafsir dans le layer.
  function toggleTafsirAudio() {
    if (tafsirPlaying) {
      tafsirAudioRef.current?.pause();
      setTafsirPlaying(false);
      return;
    }
    if (!tafsirText) return;
    // Met en pause la récitation en cours pour ne pas superposer les audios.
    audioRef.current?.pause();
    setPlaying(false);
    if (!tafsirAudioRef.current) tafsirAudioRef.current = new Audio();
    const a = tafsirAudioRef.current;
    setTafsirPlaying(true);
    fetchTTS(tafsirText).then((url) => {
      if (!url) {
        setTafsirPlaying(false);
        return;
      }
      a.src = url;
      a.onended = () => setTafsirPlaying(false);
      a.onerror = () => setTafsirPlaying(false);
      a.play().catch(() => setTafsirPlaying(false));
    });
  }

  function closeVerseLayer() {
    tafsirAudioRef.current?.pause();
    setTafsirPlaying(false);
    setVerseLayer(null);
  }

  // Enregistrement micro : démarrer/arrêter. On coupe toute lecture pour ne pas
  // s'enregistrer par-dessus la récitation.
  function toggleRecord() {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    audioRef.current?.pause();
    tafsirAudioRef.current?.pause();
    setPlaying(false);
    setTafsirPlaying(false);
    recorder.start();
  }

  function togglePlay() {
    if (playing) {
      // Annule aussi une relance de boucle en attente.
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    // Reprise d'une session en pause.
    if (sessionActive && audioRef.current && audioRef.current.src) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
      return;
    }
    // Sinon : ouvrir le configurateur.
    setShowConfig(true);
  }

  function flip(dir: 'prev' | 'next') {
    stop();
    setSelected(null);
    setVerseMenu(null);
    closeVerseLayer();
    setPage((p) => {
      const cur = p % 2 === 1 ? p : p - 1;
      let t = cur + (dir === 'next' ? 2 : -2);
      t = Math.max(1, Math.min(603, t));
      return t;
    });
  }

  // ---- Appui long → écoute de la demi-page ----
  function clearPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  // ---- Feuilletage par glissement ----
  function setWrapTransform(x: number, transition: string) {
    const el = flipWrapRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translateX(${x}px)`;
  }

  function snapBack() {
    setWrapTransform(0, 'transform 0.2s ease-out');
  }

  // Glisse la page courante hors écran, change de page, puis fait entrer la
  // nouvelle depuis le bord opposé (effet feuilletage). dir 'next' = vers la gauche.
  function animatedFlip(dir: 'prev' | 'next') {
    const el = flipWrapRef.current;
    const w = swipe.current.w || el?.offsetWidth || window.innerWidth;
    const allowed = dir === 'next' ? canNext : canPrev;
    if (!el || !allowed) {
      snapBack();
      return;
    }
    swipe.current.animating = true;
    // RTL : « suivante » sort vers la DROITE (+w), « précédente » vers la gauche.
    const outX = dir === 'next' ? w : -w;
    setWrapTransform(outX, 'transform 0.2s ease-out');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      flip(dir); // change de page (stop lecture + reset overlays)
      // Place la nouvelle page du côté opposé, sans transition…
      setWrapTransform(dir === 'next' ? -w : w, 'none');
      // …puis la fait glisser jusqu'au centre.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setWrapTransform(0, 'transform 0.2s ease-out');
          swipe.current.animating = false;
        });
      });
    };
    const onEnd = () => finish();
    el.addEventListener('transitionend', onEnd, { once: true });
    setTimeout(finish, 260); // filet de sécurité si transitionend n'arrive pas
  }

  // Logique de geste PARTAGÉE (souris via Pointer Events, tactile via Touch
  // Events : WebKit iOS annule les pointer events en plein glissement, d'où
  // un swipe mort sur iPad/iPhone alors qu'il marchait ailleurs).
  const gestureStart = (x: number, y: number, target: EventTarget | null) => {
    if (captureMode || swipe.current.animating) return;
    const el = (target as HTMLElement | null)?.closest?.('[data-verse]');
    // Glissement : autorisé partout sur le Mushaf (même hors d'un mot).
    swipe.current = {
      startX: x,
      startY: y,
      dx: 0,
      active: true,
      dragging: false,
      w: flipWrapRef.current?.offsetWidth || window.innerWidth,
      animating: false,
    };
    swipedFired.current = false;
    // Appui long : seulement sur un verset (désactivé en mode marquage, mais le
    // glissement reste actif).
    const page = Number(el?.getAttribute('data-page'));
    const verseKey = el?.getAttribute('data-verse');
    if (!el || !verseKey || !Number.isFinite(page) || markingMode) return;
    longPressFired.current = false;
    pressStart.current = { x, y, page, verseKey };
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      pressTimer.current = null;
      void readLongPress(page, verseKey);
    }, 450);
  };

  const gestureMove = (x: number, y: number) => {
    const s = swipe.current;
    if (s.active && !s.animating) {
      const dx = x - s.startX;
      const dy = y - s.startY;
      if (!s.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        // Bascule en mode glissement : annule l'appui long et ferme les overlays.
        s.dragging = true;
        clearPress();
        setVerseMenu(null);
      }
      if (s.dragging) {
        s.dx = dx;
        // Résistance quand le glissement va vers une page indisponible (RTL :
        // droite = suivante, gauche = précédente).
        const disallowed = (dx > 0 && !canNext) || (dx < 0 && !canPrev);
        setWrapTransform(disallowed ? dx / 4 : dx, 'none');
        return;
      }
    }
    // Sinon : annule l'appui long si le doigt bouge trop.
    const p = pressStart.current;
    if (p && (Math.abs(x - p.x) > 12 || Math.abs(y - p.y) > 12)) clearPress();
  };

  const gestureEnd = () => {
    clearPress();
    const s = swipe.current;
    if (s.active && s.dragging) {
      swipedFired.current = true; // neutralise le clic qui suit
      const dx = s.dx;
      const threshold = s.w * 0.2;
      // RTL : glisser vers la DROITE (dx > 0) = page suivante ; gauche = précédente.
      if (dx >= threshold) animatedFlip('next');
      else if (dx <= -threshold) animatedFlip('prev');
      else snapBack();
    }
    s.active = false;
    s.dragging = false;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return; // tactile → Touch Events
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* certains navigateurs peuvent refuser — le glissement reste fonctionnel */
    }
    gestureStart(e.clientX, e.clientY, e.target);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    gestureMove(e.clientX, e.clientY);
  };

  const onPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.pointerType === 'touch') return;
    gestureEnd();
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) gestureStart(t.clientX, t.clientY, e.target);
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) gestureMove(t.clientX, t.clientY);
  };
  const onTouchEnd = () => gestureEnd();

  // Feuilletage au trackpad : swipe horizontal à deux doigts (événements wheel).
  onWheelRef.current = (e: WheelEvent) => {
    if (captureMode) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // intention verticale → on ignore
    e.preventDefault(); // empêche la navigation arrière/avant du navigateur
    if (swipe.current.animating || wheelCooldown.current) return;
    wheelAccum.current += e.deltaX;
    if (wheelClear.current) clearTimeout(wheelClear.current);
    wheelClear.current = setTimeout(() => {
      wheelAccum.current = 0;
    }, 140);
    if (Math.abs(wheelAccum.current) > 45) {
      // RTL : swipe vers la droite = suivante. (deltaX < 0 ≈ geste vers la droite.)
      const dir = wheelAccum.current < 0 ? 'next' : 'prev';
      wheelAccum.current = 0;
      wheelCooldown.current = true;
      setTimeout(() => {
        wheelCooldown.current = false;
      }, 520);
      animatedFlip(dir);
    }
  };

  // Tap sur un mot → fiche complète (traduction + occurrences + ajout/retrait).
  // En mode « Ajouter » : n'importe quel mot. Sinon : seuls les mots du lexique
  // (surlignés) s'ouvrent — pour ne pas gêner la lecture.
  const onMushafClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Un appui long ou un glissement vient d'avoir lieu → pas de clic.
    if (longPressFired.current || swipedFired.current) {
      longPressFired.current = false;
      swipedFired.current = false;
      return;
    }
    const el = (e.target as HTMLElement).closest('[data-verse]');
    const verseKey = el?.getAttribute('data-verse');
    if (!verseKey) {
      setSelected(null);
      setVerseMenu(null);
      return;
    }
    const position = Number(el?.getAttribute('data-pos'));
    const p = Number(el?.getAttribute('data-page'));
    const isMarker = el?.classList.contains('ayah-marker');
    const isLexiconWord = !isMarker && marks.get(`${verseKey}#${position}`) === 'lexicon';

    // Mode « Marquer mes fautes » : sélectionne/désélectionne le mot touché.
    if (markingMode) {
      if (isMarker || !Number.isFinite(position)) return;
      const key = `${verseKey}#${position}`;
      setSelWords((prev) => {
        const next = new Map(prev);
        if (next.has(key)) next.delete(key);
        else next.set(key, { verseKey, position, page: p });
        return next;
      });
      return;
    }

    // Mode « Ajouter un mot » : fiche mot (comportement historique).
    if (captureMode && !isMarker && Number.isFinite(position)) {
      audioRef.current?.pause();
      setPlaying(false);
      setVerseMenu(null);
      setSelected({ verseKey, position, side: p % 2 === 1 ? 'left' : 'right', page: p });
      return;
    }
    // Mode normal : un mot du lexique surligné → fiche mot.
    if (isLexiconWord) {
      audioRef.current?.pause();
      setPlaying(false);
      setVerseMenu(null);
      setSelected({ verseKey, position, side: p % 2 === 1 ? 'left' : 'right', page: p });
      return;
    }
    // Sinon (mot normal ou numéro de verset) : menu d'actions du verset.
    setSelected(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 90), rect.width - 90);
    const y = Math.min(Math.max(e.clientY - rect.top, 10), rect.height - 20);
    setVerseMenu((m) => (m?.verseKey === verseKey ? null : { verseKey, x, y }));
  };

  const onAdded = useCallback(() => {
    setLexicon(lexiconMatchSets()); // le nouveau mot se surligne aussitôt
  }, []);

  const orientation: Orientation = 'landscape';
  const visibleVerses = useMemo(
    () => new Set([...(right?.verses ?? []), ...(left?.verses ?? [])].map((v) => v.verseKey)),
    [right, left]
  );

  // Marques combinées : lexique (si visible et hors thèmes) + fautes déclarées
  // (si visibles) + sélection en cours de marquage (prioritaire).
  const combinedMarks = useMemo(() => {
    const m = new Map<string, string>();
    if (showLexicon && !showThemes) for (const [k, v] of marks) m.set(k, v);
    if (showMistakes) for (const [k, v] of mistakeWords) m.set(k, v);
    for (const k of selWords.keys()) m.set(k, 'selected');
    return m;
  }, [showLexicon, showThemes, marks, showMistakes, mistakeWords, selWords]);

  // Déclare les mots sélectionnés avec un type de faute (mémorisé).
  const declareMistakes = (type: MistakeType) => {
    const user = getCurrentUser();
    const at = new Date().toISOString();
    recordWordMistakes(
      user,
      Array.from(selWords.values()).map((w) => ({ ...w, type, at }))
    );
    setMistakeWords(getMistakeWordMarks(user));
    setSelWords(new Map());
  };

  // Sur CHAQUE page : entoure en rouge le numéro du verset PRÉCÉDANT le verset
  // du milieu (même règle « verset du milieu » que les exercices).
  const circledMarkerVerseKeys = useMemo(() => {
    const set = new Set<string>();
    const addFor = (pv: PageVerses | null, pageNum: number) => {
      const middle = getMiddleVerse(pv, verseMap?.pages[pageNum] ?? null);
      if (!middle) return;
      const precedingGlobal = middle.globalNumber - 1;
      if (precedingGlobal < 1) return;
      const { surah, verse } = fromGlobalAyahNumber(precedingGlobal);
      set.add(`${surah}:${verse}`);
    };
    addFor(right, pair.rightPage);
    addFor(left, pair.leftPage);
    return set;
  }, [right, left, pair.rightPage, pair.leftPage, verseMap]);
  const selCount = selRef.current.length;

  return (
    <div ref={rootRef} className={`h-full w-full overflow-hidden bg-[var(--ds-green-deep)] flex overflow-locked ${isFs ? 'fixed inset-0 z-[9999]' : ''}`} style={{ fontFamily: 'var(--ds-font)' }}>
      {/* ---- Panneau de pilotage (gauche) : logo = Accueil, Réglages, Affichage, Lecture, Enregistrement ---- */}
      {!isFs && (
        <aside
          dir="ltr"
          className={`${panelOpen ? 'flex absolute inset-y-0 left-0 z-50 shadow-2xl' : 'hidden'} md:static md:flex md:shadow-none w-[236px] flex-none flex-col bg-white overflow-y-auto py-4 px-3 gap-4`}
        >
          <Link href="/exercises" className="flex flex-col items-center gap-0.5" title="Accueil">
            <span className="text-[24px] leading-none text-[var(--ds-gold)]" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
              ع
            </span>
            <span className="text-[8px] font-extrabold tracking-[0.22em] text-[var(--ds-n600)]">MURAJA3A</span>
          </Link>

          <section>
            <p className="ds-kicker mb-1.5">Réglages</p>
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="number"
                min={1}
                max={604}
                value={gotoPage}
                onChange={(e) => setGotoPage(e.target.value)}
                placeholder={`Page ${pair.rightPage}`}
                className="w-full min-w-0 px-2.5 py-2 rounded-xl border border-[var(--ds-divider)] text-sm font-bold outline-none focus:border-[var(--ds-gold)]"
              />
              <button
                onClick={() => {
                  const p = Math.max(1, Math.min(604, Number(gotoPage) || 0));
                  if (p) {
                    setPage(p);
                    setGotoPage('');
                  }
                }}
                className="ds-btn-ghost px-3 py-2 text-sm flex-none"
              >
                OK
              </button>
            </div>
            <button onClick={() => setShowConfig(true)} className="ds-btn-gold w-full py-2 text-[13px] mb-1.5">
              Plage &amp; répétitions…
            </button>
            <button onClick={() => setShowLpConfig(true)} className="ds-btn-ghost w-full py-2 text-[13px]">
              Appui long…
            </button>
          </section>

          <section>
            <p className="ds-kicker mb-1.5">Affichage</p>
            <div className="flex flex-col gap-0.5">
              {[
                { label: 'Thèmes', active: showThemes, onClick: () => setShowThemes((t) => !t) },
                {
                  label: '✍ Marquer',
                  active: markingMode,
                  onClick: () =>
                    setMarkingMode((m) => {
                      if (!m) {
                        setCaptureMode(false);
                        setVerseMenu(null);
                        setSelected(null);
                      } else {
                        setSelWords(new Map());
                      }
                      return !m;
                    }),
                },
                {
                  label: mistakeWords.size > 0 ? `Fautes (${toArabicNumbers(mistakeWords.size)})` : 'Fautes',
                  active: showMistakes && mistakeWords.size > 0,
                  onClick: () => setShowMistakes((s) => !s),
                },
                { label: 'Lexique', active: showLexicon, onClick: () => setShowLexicon((s) => !s) },
                {
                  label: '➕ Ajouter un mot',
                  active: captureMode,
                  onClick: () => {
                    setCaptureMode((m) => {
                      if (!m) {
                        setMarkingMode(false);
                        setSelWords(new Map());
                      }
                      return !m;
                    });
                    setSelected(null);
                  },
                },
                { label: 'Traduction FR', active: showTrans, onClick: () => setShowTrans((v) => !v) },
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
                    <span
                      className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${t.active ? 'left-[16px]' : 'left-[2px]'}`}
                    />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="ds-kicker mb-1.5">Lecture</p>
            <div className="flex items-center gap-1.5 mb-2">
              <button onClick={togglePlay} className="ds-btn-gold flex-1 py-2.5 text-sm">
                {playing ? '⏸ Pause' : '▶ Écouter'}
              </button>
              {sessionActive && (
                <button onClick={stop} aria-label="Arrêter" className="ds-btn-ghost px-3.5 py-2.5 text-sm flex-none">
                  ■
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setRate(s)}
                  className={`px-2 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    rate === s ? 'bg-[var(--ds-green)] text-white' : 'bg-[var(--ds-sage-100)] text-[var(--ds-n700)]'
                  }`}
                >
                  ×{s === 0.75 ? '0,75' : s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s === 2.5 ? '2,5' : s}
                </button>
              ))}
            </div>
            <button onClick={toggleFullscreen} className="ds-btn-ghost w-full py-2 text-[13px]">
              ⛶ Plein écran
            </button>
          </section>

          <section>
            <p className="ds-kicker mb-1.5">Enregistrement</p>
            <button
              onClick={toggleRecord}
              className={`w-full py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-[0.98] ${
                recorder.recording ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {recorder.recording ? '■ Arrêter' : '🎙 S’enregistrer'}
            </button>
            {recorder.error && <p className="text-[11px] text-red-600 mt-1.5">{recorder.error}</p>}
          </section>
        </aside>
      )}
      {panelOpen && (
        <button
          aria-label="Fermer le panneau"
          className="md:hidden absolute inset-0 z-40 bg-black/30"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* ---- Livre : rien d’autre que la double page ---- */}
      <div className="flex-1 min-w-0 h-full relative flex flex-col">
      {/* Bouton panneau (petit écran) */}
      {!isFs && (
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Réglages"
          className="md:hidden absolute top-2 left-2 z-30 w-10 h-10 rounded-full bg-white/90 text-[var(--ds-green)] flex items-center justify-center shadow-lg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      )}

      {/* Traduction française du verset en cours (Hamidullah).
          Hauteur FIXE + défilement interne : le texte varie d'un verset à l'autre
          mais ne repousse plus le mushaf (évite le « saut de page »). */}
      {showTrans && !isFs && (
        <div
          className="flex-none bg-[var(--ds-bg)] border-b border-[var(--ds-gold)]/40 px-4 flex items-center justify-center overflow-y-auto"
          style={{ height: 56 }}
        >
          <p className="text-[13px] text-[var(--ds-green)] leading-relaxed max-w-3xl mx-auto">
            {currentVerse && trans?.[currentVerse] ? (
              <>
                <span className="text-[11px] font-bold text-[var(--ds-gold)] mr-1">{currentVerse}</span>
                {trans[currentVerse]}
              </>
            ) : (
              <span className="text-gray-400 text-xs">Lance l&apos;écoute — la traduction du verset s&apos;affichera ici.</span>
            )}
          </p>
        </div>
      )}

      {/* Mushaf — le « livre » ouvert sur le canvas vert */}
      <div
        ref={mushafAreaRef}
        className="book-centered flex-1 min-h-0 relative select-none overflow-hidden flex flex-col"
        style={{ WebkitTouchCallout: 'none', touchAction: 'none' }}
        onClick={onMushafClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          ref={flipWrapRef}
          className="book-area w-full flex-1 min-h-0 will-change-transform flex justify-center items-start overflow-hidden"
          style={{ filter: 'drop-shadow(0 18px 32px rgba(0,0,0,0.35))' }}
        >
        <div
          className={orientation === 'landscape' ? 'book-box' : 'h-full w-full'}
        >
          <MushafDoublePage
            leftPageVerses={left}
            rightPageVerses={right}
            pagePair={pair}
            orientation={orientation}
            revealedVerses={visibleVerses}
            visibleVerses={visibleVerses}
            highlightedVerseKey={playing ? undefined : (currentVerse ?? undefined)}
            extraHighlightVerseKeys={playing ? undefined : halfPageHighlight}
            isBlurred={false}
            maskAll={false}
            wordMarks={combinedMarks}
            verseThemes={showThemes ? tafsirGroups : null}
            circledMarkerVerseKeys={circledMarkerVerseKeys}
            loading={loading}
            onTap={() => {}}
          />
        </div>
        </div>

        {/* Plein écran : bouton flottant pour sortir */}
        {isFs && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 z-30 w-10 h-10 rounded-full bg-[var(--ds-green)]/90 text-[var(--ds-gold)] flex items-center justify-center shadow-lg border border-[var(--ds-gold)]/40"
            aria-label="Quitter le plein écran"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9 4 4m0 0v4m0-4h4M15 9l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4M15 15l5 5m0 0v-4m0 4h-4" /></svg>
          </button>
        )}

        {/* Barre horizontale TRANSIENTE : visible pendant lecture / enregistrement /
            réécoute — sinon rien (le panneau de gauche pilote tout). */}
        {(playing || sessionActive || recorder.recording || recorder.audioUrl) && (
          <div
            className="ds-rise absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 md:gap-3 bg-white rounded-2xl px-3 py-1.5 w-[min(97%,900px)]"
            style={{ bottom: 'calc(4px + env(safe-area-inset-bottom))', boxShadow: 'var(--ds-shadow-lg)', fontFamily: 'var(--ds-font)' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={toggleRecord}
              aria-label={recorder.recording ? "Arrêter l'enregistrement" : 'Enregistrer'}
              className={`flex-none w-11 h-11 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white active:scale-95 transition-all ${
                recorder.recording ? 'animate-pulse' : ''
              }`}
            >
              {recorder.recording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>

            {recorder.audioUrl && !recorder.recording ? (
              <>
                <audio
                  ref={recPlayerRef}
                  controls
                  src={recorder.audioUrl}
                  className="h-9 flex-1 min-w-0"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.playbackRate = recRate;
                  }}
                />
                <div className="flex items-center gap-1 flex-none">
                  {[1, 1.5, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRecRate(r);
                        if (recPlayerRef.current) recPlayerRef.current.playbackRate = r;
                      }}
                      className={`px-2 py-1 rounded-full text-[11px] font-bold ${
                        recRate === r ? 'bg-[var(--ds-green)] text-white' : 'bg-[var(--ds-sage-100)] text-[var(--ds-n700)]'
                      }`}
                    >
                      ×{r === 1.5 ? '1,5' : r}
                    </button>
                  ))}
                  <button
                    onClick={() => recorder.clear()}
                    aria-label="Effacer l'enregistrement"
                    className="w-8 h-8 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-n700)] flex items-center justify-center"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 min-w-0 text-center">
                <p className="text-[13px] font-bold text-[var(--ds-text)] truncate">
                  {recorder.recording
                    ? 'Enregistrement en cours…'
                    : currentVerse
                      ? `Verset ${currentVerse}`
                      : `Pages ${toArabicNumbers(pair.rightPage)}–${toArabicNumbers(pair.leftPage)}`}
                </p>
                {sessionActive && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-n500)] truncate">
                    {describeSelection(config, selCount)}
                    {config.french && frAvailable === false && ' · FR indisponible'}
                    {tafsirLoading && ' · tafsir en préparation…'}
                  </p>
                )}
              </div>
            )}

            {sessionActive && (
              <button
                type="button"
                onClick={stop}
                aria-label="Arrêter la lecture"
                className="flex-none w-9 h-9 rounded-full flex items-center justify-center bg-[var(--ds-sage-100)] text-[var(--ds-n700)] hover:bg-[var(--ds-sage-200)] active:scale-95 transition-all"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              </button>
            )}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Lecture'}
              className="flex-none w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-95 transition-all"
              style={{ background: 'var(--ds-green)' }}
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => flip('next')}
              className="flex-none hidden sm:flex items-center gap-1 pl-3 pr-2 py-2 rounded-full text-[12px] font-bold text-[var(--ds-n700)] hover:bg-[var(--ds-sage-100)] transition-colors"
            >
              <span className="text-left leading-tight">
                Page suivante
                <span className="block text-[10px] text-[var(--ds-n500)]">{toArabicNumbers(Math.min(604, pair.leftPage + 1))}</span>
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {selected && (
          <WordCard
            verseKey={selected.verseKey}
            position={selected.position}
            side={selected.side}
            variant="sheet"
            onClose={() => setSelected(null)}
            onAdded={onAdded}
            onRemoved={() => {
              setLexicon(lexiconMatchSets()); // le mot retiré n'est plus surligné
              setSelected(null);
            }}
          />
        )}

        {/* Marquage : choisir le type de faute pour les mots sélectionnés */}
        {markingMode && selWords.size > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,480px)]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[var(--ds-bg)]/95 backdrop-blur border-2 border-red-300 rounded-2xl shadow-lg px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-600">
                  {toArabicNumbers(selWords.size)} mot{selWords.size > 1 ? 's' : ''} — type de faute ?
                </span>
                <button onClick={() => setSelWords(new Map())} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
                  Annuler
                </button>
              </div>
              {getCurrentUser() ? (
                <div className="flex gap-1.5 flex-wrap">
                  {MISTAKE_TYPE_META.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => declareMistakes(t.value)}
                      className="flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold bg-white border-2 active:scale-95"
                      style={{ borderColor: t.color, color: t.color }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Connecte-toi (exercice Récitation ou tableau de bord) pour mémoriser tes fautes.</p>
              )}
            </div>
          </div>
        )}

        {/* Menu d'actions au clic sur un verset */}
        {verseMenu && (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-full -mt-2"
            style={{ left: verseMenu.x, top: verseMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--ds-green)] text-[var(--ds-bg)] rounded-xl shadow-2xl border border-[var(--ds-gold)]/50 overflow-hidden min-w-[190px]">
              <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--ds-gold)] border-b border-[var(--ds-sage)] flex items-center justify-between">
                <span>Verset {verseMenu.verseKey}</span>
                <button onClick={() => setVerseMenu(null)} className="text-[var(--ds-gold)] hover:text-white px-1">✕</button>
              </div>
              <button
                onClick={() => readFromVerse(verseMenu.verseKey)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--ds-green-deep)] flex items-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Lire depuis ce verset
              </button>
              <button
                onClick={() => { setVerseLayer({ verseKey: verseMenu.verseKey, tab: 'trans' }); setVerseMenu(null); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--ds-green-deep)] flex items-center gap-2 border-t border-[var(--ds-sage)]"
              >
                📖 Voir la traduction
              </button>
              <button
                onClick={() => { setVerseLayer({ verseKey: verseMenu.verseKey, tab: 'tafsir' }); setVerseMenu(null); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--ds-green-deep)] flex items-center gap-2 border-t border-[var(--ds-sage)]"
              >
                📚 Afficher le tafsir
              </button>
            </div>
          </div>
        )}

        {/* Feuilletage : au GLISSEMENT uniquement (RTL : glisser vers la droite =
            page suivante). Les flèches ont été retirées à la demande. */}
      </div>

      {/* Layer verset : traduction ou tafsir Ibn Kathir */}
      {verseLayer && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={closeVerseLayer}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-[var(--ds-bg)] rounded-t-2xl shadow-2xl border-t-2 border-[var(--ds-gold)] max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête + onglets */}
            <div className="flex-none px-4 pt-3 pb-2 border-b border-[var(--ds-gold)]/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-[var(--ds-green)]">Verset {verseLayer.verseKey}</span>
                <button onClick={closeVerseLayer} className="text-[var(--ds-green)] text-lg leading-none px-2">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVerseLayer((l) => (l ? { ...l, tab: 'trans' } : l))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    verseLayer.tab === 'trans' ? 'bg-[var(--ds-green)] text-[var(--ds-bg)] border-[var(--ds-green)]' : 'text-[var(--ds-green)] border-[var(--ds-gold)]'
                  }`}
                >
                  📖 Traduction
                </button>
                <button
                  onClick={() => setVerseLayer((l) => (l ? { ...l, tab: 'tafsir' } : l))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    verseLayer.tab === 'tafsir' ? 'bg-[var(--ds-green)] text-[var(--ds-bg)] border-[var(--ds-green)]' : 'text-[var(--ds-green)] border-[var(--ds-gold)]'
                  }`}
                >
                  📚 Tafsir
                </button>
                <button
                  onClick={() => readFromVerse(verseLayer.verseKey)}
                  className="ml-auto flex items-center gap-1.5 bg-[var(--ds-gold)] text-[var(--ds-green)] font-bold rounded-full px-3 py-1 text-xs active:scale-95"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  Lire
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {verseLayer.tab === 'trans' ? (
                <p className="text-[15px] text-[var(--ds-green)] leading-relaxed max-w-3xl mx-auto">
                  {trans?.[verseLayer.verseKey] ?? (
                    <span className="text-gray-400 text-sm">Chargement de la traduction…</span>
                  )}
                </p>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <button
                    onClick={toggleTafsirAudio}
                    disabled={!tafsirText}
                    className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border border-[var(--ds-green)] text-[var(--ds-green)] disabled:opacity-40"
                  >
                    {tafsirPlaying ? '⏸ Pause' : '🔊 Écouter le tafsir'}
                  </button>
                  {tafsirTextLoading ? (
                    <p className="text-gray-400 text-sm">Chargement du tafsir Ibn Kathir…</p>
                  ) : tafsirText ? (
                    <p className="text-[14px] text-[#2d3a1a] leading-relaxed whitespace-pre-line">{tafsirText}</p>
                  ) : (
                    <p className="text-gray-400 text-sm">Tafsir indisponible pour ce verset.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Réglages de l'appui long */}
      {showLpConfig && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" onClick={() => setShowLpConfig(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-[var(--ds-bg)] rounded-t-2xl sm:rounded-2xl shadow-2xl border-2 border-[var(--ds-gold)] w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-[var(--ds-green)]">👆 Comportement de l&apos;appui long</h2>
              <button onClick={() => setShowLpConfig(false)} className="text-[var(--ds-green)] text-lg leading-none px-2">✕</button>
            </div>
            <p className="text-[12px] text-gray-500 mb-4">Maintiens le doigt sur un verset pour lancer l&apos;écoute avec ces réglages.</p>

            {/* Vitesse */}
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1.5">Vitesse de lecture</div>
              <div className="flex flex-wrap gap-1.5">
                {LP_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setLpConfig((c) => ({ ...c, rate: s }))}
                    className={`px-3 py-1 rounded-md text-sm font-bold border ${
                      lpConfig.rate === s ? 'bg-[var(--ds-green)] text-white border-[var(--ds-green)]' : 'bg-white text-[var(--ds-sage)] border-[var(--ds-gold)]/40'
                    }`}
                  >
                    ×{s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s === 1.75 ? '1,75' : s === 2.5 ? '2,5' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Portée */}
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1.5">Portée récitée</div>
              <div className="flex flex-col gap-1.5">
                {([
                  ['verse', 'Le verset uniquement'],
                  ['half', 'La demi-page (coupée au signet rouge)'],
                  ['page', 'La page entière'],
                  ['pages', 'Plusieurs pages (à partir du verset)'],
                ] as [LongPressScope, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setLpConfig((c) => ({ ...c, scope: val }))}
                    className={`text-left px-3 py-2 rounded-lg text-sm font-semibold border ${
                      lpConfig.scope === val ? 'bg-[var(--ds-green)] text-white border-[var(--ds-green)]' : 'bg-white text-[var(--ds-green)] border-[var(--ds-gold)]/40'
                    }`}
                  >
                    {lpConfig.scope === val ? '● ' : '○ '}{label}
                  </button>
                ))}
              </div>
              {/* Nombre de pages (portée « plusieurs pages ») */}
              {lpConfig.scope === 'pages' && (
                <div className="mt-2 pl-1">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1.5">
                    Nombre de pages
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {LP_PAGES.map((n) => (
                      <button
                        key={n}
                        onClick={() => setLpConfig((c) => ({ ...c, pages: n }))}
                        className={`w-10 py-1 rounded-md text-sm font-bold border ${
                          lpConfig.pages === n ? 'bg-[var(--ds-green)] text-white border-[var(--ds-green)]' : 'bg-white text-[var(--ds-sage)] border-[var(--ds-gold)]/40'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Lecture du verset touché jusqu&apos;à {toArabicNumbers(lpConfig.pages)} pages plus loin ; les pages tournent automatiquement.
                  </p>
                </div>
              )}
            </div>

            {/* Options traduction / tafsir */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--ds-gold)]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[var(--ds-green)]">📖 Réciter aussi la traduction (français)</span>
                <input
                  type="checkbox"
                  checked={lpConfig.french}
                  onChange={(e) => setLpConfig((c) => ({ ...c, french: e.target.checked }))}
                  className="w-5 h-5 accent-[var(--ds-green)]"
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--ds-gold)]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[var(--ds-green)]">📚 Réciter aussi le tafsir (Ibn Kathir)</span>
                <input
                  type="checkbox"
                  checked={lpConfig.tafsir}
                  onChange={(e) => setLpConfig((c) => ({ ...c, tafsir: e.target.checked }))}
                  className="w-5 h-5 accent-[var(--ds-green)]"
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--ds-gold)]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[var(--ds-green)]">🔁 Écouter en boucle la sélection</span>
                <input
                  type="checkbox"
                  checked={lpConfig.loop}
                  onChange={(e) => setLpConfig((c) => ({ ...c, loop: e.target.checked }))}
                  className="w-5 h-5 accent-[var(--ds-green)]"
                />
              </label>
              {lpConfig.loop && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--ds-gold)]/40 bg-white">
                  <span className="text-sm font-semibold text-[var(--ds-green)]">
                    ⏱ Délai avant de relancer
                    <span className="block text-[11px] font-normal text-gray-500">en secondes (1 à 500)</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={lpConfig.loopDelay}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(500, Math.round(Number(e.target.value)) || 1));
                      setLpConfig((c) => ({ ...c, loopDelay: n }));
                    }}
                    className="w-20 text-center px-2 py-1.5 rounded-lg border-2 border-[var(--ds-gold)]/40 focus:border-[var(--ds-gold)] outline-none font-bold text-[var(--ds-green)]"
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setShowLpConfig(false)}
              className="w-full mt-5 py-2.5 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl active:scale-[0.98] transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showConfig && (
        <PlaybackConfig
          initial={config}
          chapters={units?.chapters ?? []}
          units={units}
          currentSurah={Number((right?.verses?.[0] ?? left?.verses?.[0])?.verseKey?.split(':')[0]) || 2}
          onLaunch={launch}
          onClose={() => setShowConfig(false)}
        />
      )}
      </div>
    </div>
  );
}
