'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Orientation, PageVerses, PagePair, VersePosition } from '@/types';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { getAudioUrl } from '@/utils/ayahMapping';
import { getVerseRoots } from '@/utils/vocab/morphology';
import { getVocab } from '@/utils/vocab/vocabStore';
import MushafDoublePage from '@/components/MushafDoublePage';
import WordCard from '@/components/vocab/WordCard';
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

/**
 * Mode LECTURE : lire le Mushaf sur une plage, écouter la récitation Husary
 * (vitesse réglable, lecture continue + tourne-page auto), voir surlignés les
 * mots du lexique, et — en mode « Ajouter » — toucher un mot pour l'ajouter.
 */
export default function LecturePractice() {
  const params = useSearchParams();
  const startPage = Number(params.get('start')) || 2;
  const endPage = Number(params.get('end')) || Math.min(604, startPage + 1);
  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);

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
  const [selected, setSelected] = useState<{ verseKey: string; position: number; side: 'left' | 'right' } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<{ verseKey: string; globalNumber: number }[]>([]);
  const idxRef = useRef(0);
  const autoContinueRef = useRef(false);
  const rateRef = useRef(1); // vitesse courante lue dans les callbacks audio

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

  // Charge les pages quand la double page change (+ reprise lecture continue).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPageVerses(pair.leftPage), fetchPageVerses(pair.rightPage)])
      .then(([l, r]) => {
        if (cancelled) return;
        setLeft(l);
        setRight(r);
        if (autoContinueRef.current) {
          autoContinueRef.current = false;
          buildPlaylist(r, l);
          idxRef.current = 0;
          playCurrent();
        }
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
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function orderedVerses(r: PageVerses | null, l: PageVerses | null): VersePosition[] {
    const seen = new Set<number>();
    const out: VersePosition[] = [];
    for (const v of [...(r?.verses ?? []), ...(l?.verses ?? [])]) {
      if (!seen.has(v.globalNumber)) {
        seen.add(v.globalNumber);
        out.push(v);
      }
    }
    return out;
  }

  function buildPlaylist(r: PageVerses | null, l: PageVerses | null) {
    playlistRef.current = orderedVerses(r, l).map((v) => ({
      verseKey: v.verseKey,
      globalNumber: v.globalNumber,
    }));
  }

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.playbackRate = rateRef.current;
      // Garde une hauteur de voix naturelle même à ×1,5 / ×2.
      a.preservesPitch = true;
      (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      // Réaffirme la vitesse quand un nouveau verset se charge (certains
      // navigateurs remettent playbackRate à 1 au changement de src).
      a.onloadedmetadata = () => {
        a.playbackRate = rateRef.current;
      };
      a.onended = () => {
        idxRef.current += 1;
        if (idxRef.current < playlistRef.current.length) {
          playCurrent();
        } else if (pair.rightPage < hiP) {
          autoContinueRef.current = true;
          setPage((p) => (p % 2 === 1 ? p : p - 1) + 2);
        } else {
          stop();
        }
      };
      audioRef.current = a;
    }
    return audioRef.current;
  }

  function playCurrent() {
    const item = playlistRef.current[idxRef.current];
    if (!item) return;
    const a = ensureAudio();
    a.src = getAudioUrl(item.globalNumber);
    a.playbackRate = rateRef.current;
    setCurrentVerse(item.verseKey);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function togglePlay() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (playlistRef.current.length === 0 || idxRef.current >= playlistRef.current.length) {
      buildPlaylist(right, left);
      idxRef.current = 0;
    }
    if (audioRef.current && audioRef.current.src && audioRef.current.paused && currentVerse) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      playCurrent();
    }
  }

  function stop() {
    audioRef.current?.pause();
    setPlaying(false);
    setCurrentVerse(null);
    idxRef.current = 0;
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

  // Tap sur un mot en mode « Ajouter » → ouvrir sa fiche (racine + ajout).
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
    setSelected({ verseKey, position, side: p % 2 === 1 ? 'left' : 'right' });
  };

  const onAdded = useCallback(() => {
    setVocabRoots(vocabRootSet()); // le nouveau mot se surligne aussitôt
  }, []);

  const orientation: Orientation = 'landscape';
  const visibleVerses = useMemo(
    () => new Set([...(right?.verses ?? []), ...(left?.verses ?? [])].map((v) => v.verseKey)),
    [right, left]
  );

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

      {/* Contrôles : lecture + vitesse */}
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
              Écouter
            </>
          )}
        </button>
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
      </div>

      {/* Légende / mode */}
      <div className="flex-none bg-[#f4e9d0] text-[11px] text-[#4a5a2e] px-3 py-1 flex items-center justify-center gap-2">
        {vocabRoots.size > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: 'rgba(74,124,35,0.35)', boxShadow: '0 0 0 1.5px rgba(74,124,35,0.5)' }} />
            mots de ton lexique
          </span>
        )}
        {captureMode && <span className="text-[#7a5d2c] font-semibold">· touche un mot pour l&apos;ajouter</span>}
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
    </div>
  );
}
