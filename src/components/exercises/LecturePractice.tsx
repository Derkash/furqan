'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Orientation, PageVerses, PagePair, VersePosition } from '@/types';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { getAudioUrl } from '@/utils/ayahMapping';
import { getVerseRoots, getVersePageMap } from '@/utils/vocab/morphology';
import { getVocab } from '@/utils/vocab/vocabStore';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { resolveFrenchEdition, frenchAyahUrls } from '@/utils/frenchRecitation';
import {
  buildSelection,
  describeSelection,
  groupByTheme,
  DEFAULT_CONFIG,
  type PlayConfig,
  type SelVerse,
} from '@/utils/exercises/lecturePlaylist';
import { fetchIbnKathir } from '@/hooks/exercises/useIbnKathir';
import { fetchTTS } from '@/hooks/exercises/useSpeech';
import MushafDoublePage from '@/components/MushafDoublePage';
import WordCard from '@/components/vocab/WordCard';
import OccurrencesExplorer from '@/components/vocab/OccurrencesExplorer';
import PlaybackConfig from '@/components/exercises/LecturePlaybackConfig';
import { toArabicNumbers } from '@/utils/arabicNumbers';

function pairOf(page: number): PagePair {
  const right = page % 2 === 1 ? page : page - 1;
  return { rightPage: Math.max(1, right), leftPage: Math.min(604, Math.max(1, right) + 1) };
}

function vocabRootSet(): Set<string> {
  const s = new Set<string>();
  for (const e of getVocab()) if (e.root) s.add(e.root);
  return s;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

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

  const [page, setPage] = useState(lo % 2 === 0 ? lo + 1 : lo);
  const [left, setLeft] = useState<PageVerses | null>(null);
  const [right, setRight] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<Map<string, string>>(new Map());
  const [vocabRoots, setVocabRoots] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [currentVerse, setCurrentVerse] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState(false);
  const [selected, setSelected] = useState<{ verseKey: string; position: number; side: 'left' | 'right'; page: number } | null>(null);
  const [occRoot, setOccRoot] = useState<{ root: string; beforePage: number } | null>(null);
  const [showTrans, setShowTrans] = useState(false);
  const [trans, setTrans] = useState<Record<string, string> | null>(null);
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
  const rateRef = useRef(1); // vitesse courante lue dans les callbacks audio
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
    setVocabRoots(vocabRootSet());
  }, []);

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
    if (vocabRoots.size === 0 || verseKeys.length === 0) {
      setMarks(new Map());
      return;
    }
    (async () => {
      const m = new Map<string, string>();
      await Promise.all(
        verseKeys.map(async (vk) => {
          const words = await getVerseRoots(vk);
          for (const w of words) {
            if (w.root && vocabRoots.has(w.root)) m.set(`${vk}#${w.position}`, 'lexicon');
          }
        })
      );
      if (!cancelled) setMarks(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [right, left, vocabRoots]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    rateRef.current = rate;
    // Ne change la vitesse que pour l'arabe : la voix française reste à ×1.
    if (audioRef.current && phaseRef.current !== 'fr') audioRef.current.playbackRate = rate;
  }, [rate]);

  // Traduction Hamidullah (chargée à la 1re activation).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showTrans || trans) return;
    fetch('/qcf-data/translation-hamidullah.fr.json')
      .then((r) => r.json())
      .then((d) => setTrans(d))
      .catch(() => {});
  }, [showTrans, trans]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
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
      a.onended = nextStep;
      a.onerror = nextStep;
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
    vIdxRef.current = 0;
    repRef.current = 0;
    passRef.current = 0;
    sIdxRef.current = 0;
    stepsRef.current = [];
  }

  async function launch(cfg: PlayConfig) {
    const vpMap = await getVersePageMap();
    const sel = buildSelection(cfg, units, vpMap);
    if (sel.length === 0) return;
    setConfig(cfg);
    cfgRef.current = cfg;
    selRef.current = sel;
    vIdxRef.current = 0;
    repRef.current = 0;
    passRef.current = 0;
    sIdxRef.current = 0;
    phaseRef.current = 'ar';
    setSessionActive(true);
    setShowConfig(false);

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

    if (cfg.french) {
      resolveFrenchEdition().then((id) => {
        frEditionRef.current = id;
        setFrAvailable(id !== null);
      });
    }
    followPage(sel[0].page);
    playVerseArabic();
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
    setPage((p) => {
      const cur = p % 2 === 1 ? p : p - 1;
      let t = cur + (dir === 'next' ? 2 : -2);
      t = Math.max(loP, Math.min(hiP, t));
      return t;
    });
  }

  // Tap sur un mot en mode « Ajouter » → ouvrir sa fiche (racine + ajout + occurrences).
  const onMushafClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!captureMode) return;
    const el = (e.target as HTMLElement).closest('[data-verse]');
    const verseKey = el?.getAttribute('data-verse');
    if (!verseKey || el?.classList.contains('ayah-marker')) {
      setSelected(null);
      return;
    }
    const position = Number(el?.getAttribute('data-pos'));
    const p = Number(el?.getAttribute('data-page'));
    if (!Number.isFinite(position)) return;
    audioRef.current?.pause();
    setPlaying(false);
    setSelected({ verseKey, position, side: p % 2 === 1 ? 'left' : 'right', page: p });
  };

  const onAdded = useCallback(() => {
    setVocabRoots(vocabRootSet()); // le nouveau mot se surligne aussitôt
  }, []);

  const orientation: Orientation = 'landscape';
  const visibleVerses = useMemo(
    () => new Set([...(right?.verses ?? []), ...(left?.verses ?? [])].map((v) => v.verseKey)),
    [right, left]
  );
  const selCount = selRef.current.length;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Barre */}
      <div className="flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
        <Link href="/exercises/lecture/setup" className="text-sm hover:underline whitespace-nowrap">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(pair.rightPage)}–{toArabicNumbers(pair.leftPage)}
        </span>
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

      {/* Contrôles : lecture + vitesse + réglages */}
      <div className="flex-none bg-[#2d5016]/95 text-white px-3 py-2 flex items-center justify-center gap-3 flex-wrap">
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
      </div>

      {/* Récap sélection en cours */}
      {sessionActive && (
        <div className="flex-none bg-[#1f3a0f] text-[#c9a959] text-[11px] px-3 py-1 text-center">
          🎧 {describeSelection(config, selCount)}
          {config.french && frAvailable === false && (
            <span className="text-[#e7b7b7]"> · récitation FR indisponible</span>
          )}
          {tafsirLoading && <span className="text-[#c9a959]"> · 📖 préparation du tafsir…</span>}
        </div>
      )}

      {/* Traduction française du verset en cours (Hamidullah) */}
      {showTrans && (
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
      <div className="flex-none bg-[#f4e9d0] text-[11px] text-[#4a5a2e] px-3 py-1 flex items-center justify-center gap-2">
        {vocabRoots.size > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: 'rgba(74,124,35,0.35)', boxShadow: '0 0 0 1.5px rgba(74,124,35,0.5)' }} />
            mots de ton lexique
          </span>
        )}
        {captureMode && <span className="text-[#7a5d2c] font-semibold">· touche un mot pour l&apos;ajouter / voir ses occurrences</span>}
      </div>

      {/* Mushaf */}
      <div className="flex-1 min-h-0 relative" onClick={onMushafClick}>
        <MushafDoublePage
          leftPageVerses={left}
          rightPageVerses={right}
          pagePair={pair}
          orientation={orientation}
          revealedVerses={visibleVerses}
          visibleVerses={visibleVerses}
          highlightedVerseKey={currentVerse ?? undefined}
          isBlurred={false}
          maskAll={false}
          wordMarks={marks}
          loading={loading}
          onTap={() => {}}
        />

        {selected && (
          <WordCard
            verseKey={selected.verseKey}
            position={selected.position}
            side={selected.side}
            onClose={() => setSelected(null)}
            onAdded={onAdded}
            onOccurrences={(root) => setOccRoot({ root, beforePage: selected.page })}
          />
        )}

        {occRoot && (
          <OccurrencesExplorer
            root={occRoot.root}
            beforePage={occRoot.beforePage}
            onClose={() => setOccRoot(null)}
          />
        )}

        {/* Feuilletage (RTL : avancer = gauche) */}
        <button
          type="button"
          aria-label="Pages précédentes"
          disabled={!canPrev}
          onClick={(e) => {
            e.stopPropagation();
            flip('prev');
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
            canPrev ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <button
          type="button"
          aria-label="Pages suivantes"
          disabled={!canNext}
          onClick={(e) => {
            e.stopPropagation();
            flip('next');
          }}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
            canNext ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        </button>
      </div>

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
