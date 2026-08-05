'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Orientation, PagePair, PageVerses } from '@/types';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { getAudioUrl } from '@/utils/ayahMapping';
import { getMiddleVerse } from '@/utils/exercises/getMiddleVerse';
import { useVerseMap } from '@/hooks/useVerseMap';
import MushafDoublePage from '@/components/MushafDoublePage';
import { toArabicNumbers } from '@/utils/arabicNumbers';

type Unit = 'verse' | 'half' | 'page' | '2pages';
type Who = 'reciter' | 'student';

interface ChunkVerse {
  verseKey: string;
  globalNumber: number;
  page: number;
}
type Chunk = ChunkVerse[];
interface Action {
  type: 'recite' | 'gap';
  chunk: Chunk;
}

const UNITS: { id: Unit; label: string }[] = [
  { id: 'verse', label: 'Un verset' },
  { id: 'half', label: 'Une demi-page' },
  { id: 'page', label: 'Une page' },
  { id: '2pages', label: 'Deux pages' },
];
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const INTERVALS = [15, 30, 60, 120, 180];

function pairOf(page: number): PagePair {
  const right = page % 2 === 1 ? page : page - 1;
  return { rightPage: Math.max(1, right), leftPage: Math.min(604, Math.max(1, right) + 1) };
}
function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SequencedReadingPractice() {
  const { verseMap } = useVerseMap();

  // ---- Configuration ----
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config');
  const [startPage, setStartPage] = useState<number | null>(null);
  const [endPage, setEndPage] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>('page');
  const [interval, setIntervalSec] = useState(30);
  const [who, setWho] = useState<Who>('reciter');
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // ---- Déroulé ----
  const [page, setPage] = useState(2);
  const [left, setLeft] = useState<PageVerses | null>(null);
  const [right, setRight] = useState<PageVerses | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [currentVerse, setCurrentVerse] = useState<string | null>(null);
  const [sub, setSub] = useState<'recite' | 'gap'>('recite');
  const [countdown, setCountdown] = useState(0);
  const [chunkPos, setChunkPos] = useState({ i: 0, total: 0 });

  const actionsRef = useRef<Action[]>([]);
  const rateRef = useRef(1);
  const runningRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pair = pairOf(page);

  // Charge la double page courante.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phase !== 'running') return;
    let cancelled = false;
    Promise.all([fetchPageVerses(pair.leftPage), fetchPageVerses(pair.rightPage)]).then(([l, r]) => {
      if (cancelled) return;
      setLeft(l);
      setRight(r);
    });
    return () => {
      cancelled = true;
    };
  }, [pair.leftPage, pair.rightPage, phase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.preservesPitch = true;
      (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      audioRef.current = a;
    }
    return audioRef.current;
  }

  function followPage(p: number) {
    const rp = p % 2 === 1 ? p : p - 1;
    setPage((cur) => (cur === rp ? cur : rp));
  }

  // ---- Construction des tronçons selon l'unité choisie ----
  async function buildChunks(sp: number, ep: number, u: Unit): Promise<Chunk[]> {
    const used = new Set<string>();
    const chunks: Chunk[] = [];
    const add = (verses: ChunkVerse[]) => {
      const fresh = verses.filter((v) => !used.has(v.verseKey));
      if (fresh.length) {
        fresh.forEach((v) => used.add(v.verseKey));
        chunks.push(fresh);
      }
    };
    const toCV = (pv: PageVerses): ChunkVerse[] =>
      pv.verses.map((v) => ({ verseKey: v.verseKey, globalNumber: v.globalNumber, page: v.page }));

    if (u === '2pages') {
      for (let p = sp; p <= ep; p += 2) {
        const pv1 = await fetchPageVerses(p).catch(() => null);
        const pv2 = p + 1 <= ep ? await fetchPageVerses(p + 1).catch(() => null) : null;
        add([...(pv1 ? toCV(pv1) : []), ...(pv2 ? toCV(pv2) : [])]);
      }
      return chunks;
    }

    for (let p = sp; p <= ep; p++) {
      const pv = await fetchPageVerses(p).catch(() => null);
      if (!pv) continue;
      const cv = toCV(pv);
      if (u === 'verse') {
        cv.forEach((v) => add([v]));
      } else if (u === 'page') {
        add(cv);
      } else {
        // demi-page : coupée au verset du milieu
        const middle = getMiddleVerse(pv, verseMap?.pages[p] ?? null);
        const midG = middle?.globalNumber ?? Number.POSITIVE_INFINITY;
        add(cv.filter((v) => v.globalNumber < midG));
        add(cv.filter((v) => v.globalNumber >= midG));
      }
    }
    return chunks;
  }

  // ---- Moteur ----
  function reciteChunk(chunk: Chunk, onDone: () => void) {
    setSub('recite');
    let vi = 0;
    const playNext = () => {
      if (!runningRef.current) return;
      if (vi >= chunk.length) {
        onDone();
        return;
      }
      const v = chunk[vi];
      setRevealed((prev) => {
        const n = new Set(prev);
        n.add(v.verseKey);
        return n;
      });
      setCurrentVerse(v.verseKey);
      followPage(v.page);
      const a = ensureAudio();
      a.src = getAudioUrl(v.globalNumber);
      a.playbackRate = rateRef.current;
      a.onended = () => {
        vi += 1;
        playNext();
      };
      a.onerror = () => {
        vi += 1;
        playNext();
      };
      a.play().catch(() => {
        vi += 1;
        playNext();
      });
    };
    playNext();
  }

  function doGap(onDone: () => void) {
    setSub('gap');
    setCurrentVerse(null);
    let rem = interval;
    setCountdown(rem);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!runningRef.current) return;
      rem -= 1;
      setCountdown(rem);
      if (rem <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        onDone();
      }
    }, 1000);
  }

  function runAction(k: number) {
    if (!runningRef.current) return;
    const actions = actionsRef.current;
    if (k >= actions.length) {
      finish();
      return;
    }
    // Position (numéro de tronçon en cours) pour la barre de progression.
    const a = actions[k];
    const reciteIdx = actions.slice(0, k + 1).filter((x) => x.type === 'recite').length;
    setChunkPos({ i: Math.max(1, reciteIdx), total: actions.filter((x) => x.type === 'recite').length });
    if (a.type === 'recite') reciteChunk(a.chunk, () => runAction(k + 1));
    else doGap(() => runAction(k + 1));
  }

  function finish() {
    runningRef.current = false;
    audioRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentVerse(null);
    setPhase('done');
  }

  function stop() {
    runningRef.current = false;
    audioRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('config');
    setRevealed(new Set());
    setCurrentVerse(null);
  }

  async function launch() {
    setError(null);
    const sp = startPage;
    const ep = endPage;
    if (sp == null || ep == null) {
      setError('Saisis une page de début et de fin.');
      return;
    }
    const lo = Math.min(sp, ep);
    const hi = Math.max(sp, ep);
    if (lo < 1 || hi > 604) {
      setError('Les pages doivent être entre 1 et 604.');
      return;
    }
    const chunks = await buildChunks(lo, hi, unit);
    if (chunks.length === 0) {
      setError('Aucun verset trouvé sur cette plage.');
      return;
    }
    const actions: Action[] = [];
    for (const c of chunks) {
      // Récitateur : récite puis intervalle. Élève : intervalle puis récitateur.
      if (who === 'reciter') {
        actions.push({ type: 'recite', chunk: c });
        actions.push({ type: 'gap', chunk: c });
      } else {
        actions.push({ type: 'gap', chunk: c });
        actions.push({ type: 'recite', chunk: c });
      }
    }
    actionsRef.current = actions;
    rateRef.current = rate;
    runningRef.current = true;
    setRevealed(new Set());
    setCurrentVerse(null);
    followPage(chunks[0][0].page);
    setPhase('running');
    // Laisse le premier rendu se faire avant de démarrer l'audio.
    setTimeout(() => runAction(0), 50);
  }

  const orientation: Orientation = 'landscape';

  // ---- Écran de configuration ----
  if (phase === 'config') {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-[#fdfaf3] to-[#f4e9d0] p-4 pb-12" dir="ltr">
        <div className="max-w-md mx-auto">
          <Link href="/exercises" className="text-[#4a7c23] text-sm hover:underline mb-4 inline-block">
            ← Retour aux exercices
          </Link>
          <div className="bg-white rounded-2xl shadow-lg p-5 border border-[#c9a959]/20 space-y-4">
            <div>
              <h1 className="text-xl font-bold text-[#2d5016]">Lecture séquencée</h1>
              <p className="text-gray-500 text-sm mt-1">
                Le récitateur lit une sélection, laisse un intervalle pour que tu récites, puis
                continue jusqu&apos;à la fin de la plage.
              </p>
            </div>

            {/* Plage de pages */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Plage de pages</p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">Début</label>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    placeholder="1–604"
                    value={startPage ?? ''}
                    onChange={(e) => setStartPage(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-2 text-center font-bold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl focus:outline-none focus:border-[#2d5016]"
                  />
                </div>
                <span className="pb-2 text-[#c9a959]">→</span>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">Fin</label>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    placeholder="1–604"
                    value={endPage ?? ''}
                    onChange={(e) => setEndPage(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-2 text-center font-bold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl focus:outline-none focus:border-[#2d5016]"
                  />
                </div>
              </div>
            </div>

            {/* Sélection récitée à chaque fois */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Sélection à chaque tour</p>
              <div className="grid grid-cols-2 gap-1.5">
                {UNITS.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setUnit(u.id)}
                    className={`py-2 rounded-lg text-sm font-bold border-2 ${
                      unit === u.id ? 'bg-[#2d5016] text-white border-[#2d5016]' : 'bg-white text-[#4a7c23] border-[#c9a959]/30'
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Qui commence */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Qui commence</p>
              <div className="flex gap-1.5">
                {([
                  ['reciter', '🎧 Le récitateur'],
                  ['student', '🧑‍🎓 L’élève'],
                ] as [Who, string][]).map(([w, label]) => (
                  <button
                    key={w}
                    onClick={() => setWho(w)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 ${
                      who === w ? 'bg-[#2d5016] text-white border-[#2d5016]' : 'bg-white text-[#4a7c23] border-[#c9a959]/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {who === 'student'
                  ? 'Tu récites d’abord (décompte, texte masqué), puis le récitateur révèle et récite.'
                  : 'Le récitateur récite d’abord (texte affiché), puis un décompte pour que tu répètes.'}
              </p>
            </div>

            {/* Intervalle */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Intervalle (décompte)</p>
              <div className="flex gap-1.5 flex-wrap">
                {INTERVALS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setIntervalSec(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 ${
                      interval === s ? 'bg-[#4a7c23] text-white border-[#4a7c23]' : 'bg-white text-[#2d5016] border-[#c9a959]/30'
                    }`}
                  >
                    {fmt(s)}
                  </button>
                ))}
              </div>
            </div>

            {/* Vitesse */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Vitesse de lecture</p>
              <div className="flex gap-1.5 flex-wrap">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setRate(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 ${
                      rate === s ? 'bg-[#4a7c23] text-white border-[#4a7c23]' : 'bg-white text-[#2d5016] border-[#c9a959]/30'
                    }`}
                  >
                    ×{s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s === 0.75 ? '0,75' : s}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            <button
              onClick={launch}
              className="w-full py-3 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white font-bold rounded-xl active:scale-[0.98] transition-all"
            >
              ▶ Démarrer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Écran de fin ----
  if (phase === 'done') {
    return (
      <div className="min-h-[100dvh] bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border-2 border-[#2d5016] text-center">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-2">Terminé ! 🎉</h2>
          <p className="text-[#4a7c23] mb-4 text-sm">Tu as parcouru toute la plage.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => setPhase('config')} className="px-4 py-2 bg-[#c9a959] text-white rounded-lg font-semibold">
              Recommencer
            </button>
            <Link href="/exercises" className="px-4 py-2 bg-[#2d5016] text-white rounded-lg font-semibold">
              Autres exercices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- Écran de déroulé ----
  const visible = revealed;
  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#fdfaf3] flex flex-col">
      {/* Barre */}
      <div className="flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={stop} className="text-sm hover:underline whitespace-nowrap">
          ← Arrêter
        </button>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(pair.rightPage)}–{toArabicNumbers(pair.leftPage)}
        </span>
        <span className="text-xs font-bold bg-[#1f3a0f] rounded-full px-2.5 py-1 whitespace-nowrap">
          {chunkPos.i} / {chunkPos.total}
        </span>
      </div>

      {/* Mushaf (versets révélés accumulés) */}
      <div className="flex-1 min-h-0 relative">
        <MushafDoublePage
          leftPageVerses={left}
          rightPageVerses={right}
          pagePair={pair}
          orientation={orientation}
          revealedVerses={visible}
          visibleVerses={visible}
          highlightedVerseKey={currentVerse ?? undefined}
          isBlurred={false}
          maskAll
          loading={false}
          onTap={() => {}}
        />

        {/* Décompte plein cadre pendant l'intervalle */}
        {sub === 'gap' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#fdfaf3]/80 backdrop-blur-sm">
            <span className="text-[13px] font-bold uppercase tracking-widest text-[#c9a959] mb-2">
              {who === 'student' ? 'À toi de réciter' : 'Répète à voix haute'}
            </span>
            <span className="text-7xl sm:text-8xl font-bold tabular-nums text-[#2d5016]">{fmt(Math.max(0, countdown))}</span>
          </div>
        )}
      </div>
    </div>
  );
}
