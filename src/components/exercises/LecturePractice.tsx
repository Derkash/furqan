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
import MushafDoublePage from '@/components/MushafDoublePage';
import WordCard from '@/components/vocab/WordCard';
import PlaybackConfig from '@/components/exercises/LecturePlaybackConfig';
import { toArabicNumbers } from '@/utils/arabicNumbers';

function pairOf(page: number): PagePair {
  const right = page % 2 === 1 ? page : page - 1;
  return { rightPage: Math.max(1, right), leftPage: Math.min(604, Math.max(1, right) + 1) };
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// Réglages du comportement de l'appui long (persistés dans localStorage).
const LP_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
type LongPressScope = 'verse' | 'half' | 'page';
interface LongPressConfig {
  rate: number;
  scope: LongPressScope;
  french: boolean; // réciter aussi la traduction française
  tafsir: boolean; // réciter aussi le tafsir Ibn Kathir
  loop: boolean; // écouter la sélection en boucle
}
const LP_DEFAULT: LongPressConfig = { rate: 2, scope: 'half', french: false, tafsir: false, loop: false };
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
  const startPage = Number(params.get('start')) || 2;
  const endPage = Number(params.get('end')) || Math.min(604, startPage + 1);
  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);

  const { data: units } = useQuranUnits();
  const { verseMap } = useVerseMap();
  const recorder = useAudioRecorder(); // enregistrement micro + réécoute

  const [page, setPage] = useState(lo % 2 === 0 ? lo + 1 : lo);
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
  // Réécoute de l'enregistrement micro : lecteur + vitesse.
  const recPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [recRate, setRecRate] = useState(2);
  // Configurateur de lecture.
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<PlayConfig>({
    ...DEFAULT_CONFIG,
    selMode: 'page',
    unitStart: lo,
    unitEnd: hi,
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
  const loP = lo % 2 === 1 ? lo : lo - 1;
  const hiP = hi % 2 === 1 ? hi : hi - 1;
  const canPrev = pair.rightPage > loP;
  const canNext = pair.rightPage < hiP;

  /* eslint-disable react-hooks/set-state-in-effect */
  // Racines du lexique (rechargeable après ajout d'un mot).
  useEffect(() => {
    setLexicon(lexiconMatchSets());
    setLpConfig(loadLongPressConfig());
  }, []);

  // Persiste les réglages d'appui long.
  useEffect(() => {
    try {
      window.localStorage.setItem(LP_KEY, JSON.stringify(lpConfig));
    } catch {
      /* quota — silencieux */
    }
  }, [lpConfig]);

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

  // Suivi de l'état plein écran (bouton ⛶ + touche Échap du navigateur).
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
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

  function advanceVerse() {
    const cfg = cfgRef.current;
    const sel = selRef.current;
    repRef.current = 0;
    phaseRef.current = 'ar';
    if (vIdxRef.current + 1 < sel.length) {
      vIdxRef.current += 1;
      playVerseArabic();
      return;
    }
    // Fin de la sélection : rejoue si demandé (0 = infini).
    passRef.current += 1;
    if (cfg.selectionRepeat === 0 || passRef.current < cfg.selectionRepeat) {
      vIdxRef.current = 0;
      playVerseArabic();
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
      playStep();
      return;
    }
    passRef.current += 1;
    if (cfg.selectionRepeat === 0 || passRef.current < cfg.selectionRepeat) {
      sIdxRef.current = 0;
      playStep();
      return;
    }
    stop();
  }

  function stop() {
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
    const sel = buildSelection(cfg, units, vpMap);
    if (sel.length === 0) return;
    setConfig(cfg);
    await startPlayback(sel, cfg);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      rootRef.current?.requestFullscreen().catch(() => {});
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
  // traduction, tafsir). Portée = verset seul / demi-page (coupée au verset du
  // milieu, le signet rouge) / page entière. Versets lus surlignés en jaune.
  function readLongPress(pageNum: number, pressedVerseKey: string) {
    const pv = pageNum === pair.leftPage ? left : pageNum === pair.rightPage ? right : null;
    if (!pv || pv.verses.length === 0) return;
    const lpc = lpConfigRef.current;

    let scope: typeof pv.verses;
    if (lpc.scope === 'verse') {
      const v = pv.verses.find((x) => x.verseKey === pressedVerseKey);
      scope = v ? [v] : [];
    } else if (lpc.scope === 'page') {
      scope = pv.verses;
    } else {
      // Demi-page : coupée au verset du milieu (signet rouge). Clic au-dessus →
      // moitié haute ; au niveau/après → moitié basse.
      const middle = getMiddleVerse(pv, verseMap?.pages[pageNum] ?? null);
      const midGlobal = middle?.globalNumber ?? Infinity;
      const pressedGlobal = pv.verses.find((v) => v.verseKey === pressedVerseKey)?.globalNumber ?? 0;
      const upper = pressedGlobal < midGlobal;
      scope = pv.verses.filter((v) => (upper ? v.globalNumber < midGlobal : v.globalNumber >= midGlobal));
    }
    if (scope.length === 0) return;

    stop();
    const sel: SelVerse[] = scope.map((v) => ({
      verseKey: v.verseKey,
      globalNumber: v.globalNumber,
      page: pageNum,
    }));
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
      t = Math.max(loP, Math.min(hiP, t));
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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (captureMode || swipe.current.animating) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* certains navigateurs peuvent refuser — le glissement reste fonctionnel */
    }
    const el = (e.target as HTMLElement).closest('[data-verse]');
    // Glissement : autorisé partout sur le Mushaf (même hors d'un mot).
    swipe.current = {
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      active: true,
      dragging: false,
      w: flipWrapRef.current?.offsetWidth || window.innerWidth,
      animating: false,
    };
    swipedFired.current = false;
    // Appui long : seulement sur un verset.
    const page = Number(el?.getAttribute('data-page'));
    const verseKey = el?.getAttribute('data-verse');
    if (!el || !verseKey || !Number.isFinite(page)) return;
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY, page, verseKey };
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      pressTimer.current = null;
      readLongPress(page, verseKey);
    }, 450);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (s.active && !s.animating) {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
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
    if (p && (Math.abs(e.clientX - p.x) > 12 || Math.abs(e.clientY - p.y) > 12)) clearPress();
  };

  const onPointerUp = () => {
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
    <div ref={rootRef} className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Barre */}
      <div className={`flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2 ${isFs ? 'hidden' : ''}`}>
        <Link href="/exercises/lecture/setup" className="text-sm hover:underline whitespace-nowrap">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(pair.rightPage)}–{toArabicNumbers(pair.leftPage)}
        </span>
        <div className="flex items-center gap-2">
        <button
          onClick={toggleFullscreen}
          title={isFs ? 'Quitter le plein écran' : 'Plein écran'}
          className="text-xs font-bold rounded-full px-2.5 py-1 border text-[#c9a959] border-[#4a7c23] hover:bg-[#1f3a0f]"
        >
          {isFs ? '⛶ Quitter' : '⛶ Plein écran'}
        </button>
        <button
          onClick={() => {
            setCaptureMode((m) => !m);
            setSelected(null);
          }}
          className={`text-xs font-bold rounded-full px-2.5 py-1 border ${
            captureMode ? 'bg-[#c9a959] text-[#2d5016] border-[#c9a959]' : 'text-[#c9a959] border-[#4a7c23]'
          }`}
        >
          ➕ Ajouter un mot
        </button>
        </div>
      </div>

      {/* Contrôles : lecture + vitesse + réglages */}
      <div className={`flex-none bg-[#2d5016]/95 text-white px-3 py-2 flex items-center justify-center gap-3 flex-wrap ${isFs ? 'hidden' : ''}`}>
        <button
          onClick={togglePlay}
          className="flex items-center gap-2 bg-[#c9a959] text-[#2d5016] font-bold rounded-full px-4 py-1.5 active:scale-95 transition-all"
        >
          {playing ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              Pause
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              {sessionActive ? 'Reprendre' : 'Écouter'}
            </>
          )}
        </button>
        <button
          onClick={() => setShowConfig(true)}
          title="Configurer la lecture (plage, répétitions, français)"
          className="flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border border-[#c9a959] text-[#c9a959] hover:bg-[#1f3a0f]"
        >
          ⚙️ Réglages
        </button>
        <button
          onClick={() => setShowLpConfig(true)}
          title="Régler le comportement de l'appui long (vitesse, portée, traduction, tafsir)"
          className="flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border border-[#c9a959] text-[#c9a959] hover:bg-[#1f3a0f]"
        >
          👆 Appui long
        </button>
        {sessionActive && (
          <button
            onClick={stop}
            title="Arrêter"
            className="text-[12px] font-bold rounded-full px-3 py-1.5 border border-[#7a3030] text-[#e7b7b7] hover:bg-[#1f3a0f]"
          >
            ■ Stop
          </button>
        )}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#c9a959] mr-1">Vitesse</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setRate(s)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                rate === s ? 'bg-[#c9a959] text-[#2d5016]' : 'bg-[#1f3a0f] text-[#c9a959]'
              }`}
            >
              ×{s === 0.75 ? '0,75' : s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowTrans((v) => !v)}
          title="Afficher la traduction française du verset"
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            showTrans ? 'bg-[#c9a959] text-[#2d5016] border-[#c9a959]' : 'text-[#c9a959] border-[#4a7c23]'
          }`}
        >
          FR texte
        </button>
        <button
          onClick={toggleRecord}
          title="M'enregistrer au micro puis me réécouter"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
            recorder.recording
              ? 'bg-[#7a3030] text-white border-[#7a3030] animate-pulse'
              : 'text-[#c9a959] border-[#4a7c23] hover:bg-[#1f3a0f]'
          }`}
        >
          {recorder.recording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white" /> Arrêter
            </>
          ) : (
            <>🎤 M&apos;enregistrer</>
          )}
        </button>
      </div>

      {/* Enregistrement micro : état + réécoute */}
      {(recorder.recording || recorder.audioUrl || recorder.error) && !isFs && (
        <div className="flex-none bg-[#1f3a0f] px-3 py-2 flex items-center justify-center gap-3 flex-wrap">
          {recorder.recording ? (
            <span className="flex items-center gap-2 text-[#e7b7b7] text-sm font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              Enregistrement en cours… parle puis appuie sur « Arrêter »
            </span>
          ) : recorder.audioUrl ? (
            <>
              <span className="text-[11px] font-bold text-[#c9a959] whitespace-nowrap">🎧 Ta récitation</span>
              <audio
                ref={recPlayerRef}
                controls
                src={recorder.audioUrl}
                className="h-9 max-w-full"
                onLoadedMetadata={(e) => {
                  e.currentTarget.playbackRate = recRate;
                }}
              />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#c9a959] font-bold mr-0.5">Vitesse</span>
                {[0.75, 1, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRecRate(r);
                      if (recPlayerRef.current) recPlayerRef.current.playbackRate = r;
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      recRate === r ? 'bg-[#c9a959] text-[#2d5016]' : 'bg-[#2d5016] text-[#c9a959] border border-[#c9a959]/40'
                    }`}
                  >
                    ×{r === 0.75 ? '0,75' : r === 1.5 ? '1,5' : r}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleRecord}
                className="text-[11px] font-bold rounded-full px-3 py-1 border border-[#c9a959] text-[#c9a959] hover:bg-[#2d5016]"
              >
                🎤 Réenregistrer
              </button>
              <button
                onClick={() => recorder.clear()}
                className="text-[11px] font-bold rounded-full px-3 py-1 border border-[#7a3030] text-[#e7b7b7] hover:bg-[#2d5016]"
              >
                🗑️ Effacer
              </button>
            </>
          ) : null}
          {recorder.error && <span className="text-[#e7b7b7] text-xs">{recorder.error}</span>}
        </div>
      )}

      {/* Récap sélection en cours */}
      {sessionActive && !isFs && (
        <div className="flex-none bg-[#1f3a0f] text-[#c9a959] text-[11px] px-3 py-1 text-center">
          🎧 {describeSelection(config, selCount)}
          {config.french && frAvailable === false && (
            <span className="text-[#e7b7b7]"> · récitation FR indisponible</span>
          )}
          {tafsirLoading && <span className="text-[#c9a959]"> · 📖 préparation du tafsir…</span>}
        </div>
      )}

      {/* Traduction française du verset en cours (Hamidullah) */}
      {showTrans && !isFs && (
        <div className="flex-none bg-[#fdfaf3] border-b border-[#c9a959]/40 px-4 py-2 text-center">
          <p className="text-[13px] text-[#2d5016] leading-relaxed max-w-3xl mx-auto">
            {currentVerse && trans?.[currentVerse] ? (
              <>
                <span className="text-[11px] font-bold text-[#c9a959] mr-1">{currentVerse}</span>
                {trans[currentVerse]}
              </>
            ) : (
              <span className="text-gray-400 text-xs">Lance l&apos;écoute — la traduction du verset s&apos;affichera ici.</span>
            )}
          </p>
        </div>
      )}

      {/* Légende / mode */}
      <div className={`flex-none bg-[#f4e9d0] text-[11px] text-[#4a5a2e] px-3 py-1 flex items-center justify-center gap-2 ${isFs ? 'hidden' : ''}`}>
        {lexSize > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: 'rgba(74,124,35,0.35)', boxShadow: '0 0 0 1.5px rgba(74,124,35,0.5)' }} />
            mots de ton lexique
          </span>
        )}
        {captureMode && <span className="text-[#7a5d2c] font-semibold">· touche un mot pour l&apos;ajouter / voir ses occurrences</span>}
      </div>

      {/* Mushaf */}
      <div
        ref={mushafAreaRef}
        className="flex-1 min-h-0 relative select-none overflow-hidden"
        style={{ WebkitTouchCallout: 'none', touchAction: 'pan-y' }}
        onClick={onMushafClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div ref={flipWrapRef} className="w-full h-full will-change-transform">
          <MushafDoublePage
            leftPageVerses={left}
            rightPageVerses={right}
            pagePair={pair}
            orientation={orientation}
            revealedVerses={visibleVerses}
            visibleVerses={visibleVerses}
            highlightedVerseKey={currentVerse ?? undefined}
            extraHighlightVerseKeys={halfPageHighlight}
            isBlurred={false}
            maskAll={false}
            wordMarks={marks}
            circledMarkerVerseKeys={circledMarkerVerseKeys}
            loading={loading}
            onTap={() => {}}
          />
        </div>

        {/* Plein écran : bouton flottant pour sortir + play/pause */}
        {isFs && (
          <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
            {(playing || sessionActive) && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-10 h-10 rounded-full bg-[#2d5016]/90 text-[#c9a959] flex items-center justify-center shadow-lg border border-[#c9a959]/40"
                aria-label={playing ? 'Pause' : 'Lecture'}
              >
                {playing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="w-10 h-10 rounded-full bg-[#2d5016]/90 text-[#c9a959] flex items-center justify-center shadow-lg border border-[#c9a959]/40"
              aria-label="Quitter le plein écran"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9 4 4m0 0v4m0-4h4M15 9l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4M15 15l5 5m0 0v-4m0 4h-4" /></svg>
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

        {/* Menu d'actions au clic sur un verset */}
        {verseMenu && (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-full -mt-2"
            style={{ left: verseMenu.x, top: verseMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#2d5016] text-[#fdfaf3] rounded-xl shadow-2xl border border-[#c9a959]/50 overflow-hidden min-w-[190px]">
              <div className="px-3 py-1.5 text-[11px] font-bold text-[#c9a959] border-b border-[#4a7c23] flex items-center justify-between">
                <span>Verset {verseMenu.verseKey}</span>
                <button onClick={() => setVerseMenu(null)} className="text-[#c9a959] hover:text-white px-1">✕</button>
              </div>
              <button
                onClick={() => readFromVerse(verseMenu.verseKey)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#1f3a0f] flex items-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Lire depuis ce verset
              </button>
              <button
                onClick={() => { setVerseLayer({ verseKey: verseMenu.verseKey, tab: 'trans' }); setVerseMenu(null); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#1f3a0f] flex items-center gap-2 border-t border-[#4a7c23]"
              >
                📖 Voir la traduction
              </button>
              <button
                onClick={() => { setVerseLayer({ verseKey: verseMenu.verseKey, tab: 'tafsir' }); setVerseMenu(null); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#1f3a0f] flex items-center gap-2 border-t border-[#4a7c23]"
              >
                📚 Afficher le tafsir
              </button>
            </div>
          </div>
        )}

        {/* Feuilletage (RTL : suivante = vers la droite) */}
        <button
          type="button"
          aria-label="Pages suivantes"
          disabled={!canNext}
          onClick={(e) => {
            e.stopPropagation();
            animatedFlip('next');
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
            canNext ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <button
          type="button"
          aria-label="Pages précédentes"
          disabled={!canPrev}
          onClick={(e) => {
            e.stopPropagation();
            animatedFlip('prev');
          }}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
            canPrev ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        </button>
      </div>

      {/* Layer verset : traduction ou tafsir Ibn Kathir */}
      {verseLayer && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={closeVerseLayer}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-[#fdfaf3] rounded-t-2xl shadow-2xl border-t-2 border-[#c9a959] max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête + onglets */}
            <div className="flex-none px-4 pt-3 pb-2 border-b border-[#c9a959]/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-[#2d5016]">Verset {verseLayer.verseKey}</span>
                <button onClick={closeVerseLayer} className="text-[#2d5016] text-lg leading-none px-2">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVerseLayer((l) => (l ? { ...l, tab: 'trans' } : l))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    verseLayer.tab === 'trans' ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016]' : 'text-[#2d5016] border-[#c9a959]'
                  }`}
                >
                  📖 Traduction
                </button>
                <button
                  onClick={() => setVerseLayer((l) => (l ? { ...l, tab: 'tafsir' } : l))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    verseLayer.tab === 'tafsir' ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016]' : 'text-[#2d5016] border-[#c9a959]'
                  }`}
                >
                  📚 Tafsir
                </button>
                <button
                  onClick={() => readFromVerse(verseLayer.verseKey)}
                  className="ml-auto flex items-center gap-1.5 bg-[#c9a959] text-[#2d5016] font-bold rounded-full px-3 py-1 text-xs active:scale-95"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  Lire
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {verseLayer.tab === 'trans' ? (
                <p className="text-[15px] text-[#2d5016] leading-relaxed max-w-3xl mx-auto">
                  {trans?.[verseLayer.verseKey] ?? (
                    <span className="text-gray-400 text-sm">Chargement de la traduction…</span>
                  )}
                </p>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <button
                    onClick={toggleTafsirAudio}
                    disabled={!tafsirText}
                    className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border border-[#2d5016] text-[#2d5016] disabled:opacity-40"
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
            className="relative bg-[#fdfaf3] rounded-t-2xl sm:rounded-2xl shadow-2xl border-2 border-[#c9a959] w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-[#2d5016]">👆 Comportement de l&apos;appui long</h2>
              <button onClick={() => setShowLpConfig(false)} className="text-[#2d5016] text-lg leading-none px-2">✕</button>
            </div>
            <p className="text-[12px] text-gray-500 mb-4">Maintiens le doigt sur un verset pour lancer l&apos;écoute avec ces réglages.</p>

            {/* Vitesse */}
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Vitesse de lecture</div>
              <div className="flex flex-wrap gap-1.5">
                {LP_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setLpConfig((c) => ({ ...c, rate: s }))}
                    className={`px-3 py-1 rounded-md text-sm font-bold border ${
                      lpConfig.rate === s ? 'bg-[#2d5016] text-white border-[#2d5016]' : 'bg-white text-[#4a7c23] border-[#c9a959]/40'
                    }`}
                  >
                    ×{s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s === 1.75 ? '1,75' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Portée */}
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Portée récitée</div>
              <div className="flex flex-col gap-1.5">
                {([
                  ['verse', 'Le verset uniquement'],
                  ['half', 'La demi-page (coupée au signet rouge)'],
                  ['page', 'La page entière'],
                ] as [LongPressScope, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setLpConfig((c) => ({ ...c, scope: val }))}
                    className={`text-left px-3 py-2 rounded-lg text-sm font-semibold border ${
                      lpConfig.scope === val ? 'bg-[#2d5016] text-white border-[#2d5016]' : 'bg-white text-[#2d5016] border-[#c9a959]/40'
                    }`}
                  >
                    {lpConfig.scope === val ? '● ' : '○ '}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options traduction / tafsir */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#c9a959]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[#2d5016]">📖 Réciter aussi la traduction (français)</span>
                <input
                  type="checkbox"
                  checked={lpConfig.french}
                  onChange={(e) => setLpConfig((c) => ({ ...c, french: e.target.checked }))}
                  className="w-5 h-5 accent-[#2d5016]"
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#c9a959]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[#2d5016]">📚 Réciter aussi le tafsir (Ibn Kathir)</span>
                <input
                  type="checkbox"
                  checked={lpConfig.tafsir}
                  onChange={(e) => setLpConfig((c) => ({ ...c, tafsir: e.target.checked }))}
                  className="w-5 h-5 accent-[#2d5016]"
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#c9a959]/40 bg-white cursor-pointer">
                <span className="text-sm font-semibold text-[#2d5016]">🔁 Écouter en boucle la sélection</span>
                <input
                  type="checkbox"
                  checked={lpConfig.loop}
                  onChange={(e) => setLpConfig((c) => ({ ...c, loop: e.target.checked }))}
                  className="w-5 h-5 accent-[#2d5016]"
                />
              </label>
            </div>

            <button
              onClick={() => setShowLpConfig(false)}
              className="w-full mt-5 py-2.5 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white font-bold rounded-xl active:scale-[0.98] transition-all"
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
          onLaunch={launch}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
