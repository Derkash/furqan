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
const SPEEDS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const INTERVALS = [15, 30, 60, 120, 180];
function speedLabel(s: number): string {
  return `×${s === 1.25 ? '1,25' : s === 1.5 ? '1,5' : s === 0.75 ? '0,75' : s === 2.5 ? '2,5' : s}`;
}
// Petit WAV silencieux : joué dans le geste « Démarrer » pour débloquer la
// lecture audio (sinon les navigateurs bloquent la lecture auto ensuite).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAA=';
const LS_KEY = 'almuraja3a:seqreading'; // dernière config mémorisée

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
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(false); // répéter en boucle la sélection en cours

  const actionsRef = useRef<Action[]>([]);
  const rateRef = useRef(1);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const loopRef = useRef(false);
  // Callback « passer à l'action suivante » de l'action en cours (récitation OU
  // décompte). Appelé une seule fois (mis à null) → évite un double avancement.
  const pendingRef = useRef<(() => void) | null>(null);
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
    // Applique la vitesse à la récitation en cours immédiatement.
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Restaure la dernière configuration saisie (plage, unité, qui commence,
  // intervalle, vitesse).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<{
        startPage: number;
        endPage: number;
        unit: Unit;
        interval: number;
        who: Who;
        rate: number;
      }>;
      if (typeof s.startPage === 'number') setStartPage(s.startPage);
      if (typeof s.endPage === 'number') setEndPage(s.endPage);
      if (s.unit) setUnit(s.unit);
      if (typeof s.interval === 'number') setIntervalSec(s.interval);
      if (s.who) setWho(s.who);
      if (typeof s.rate === 'number') setRate(s.rate);
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    // Affiche TOUTE la sélection d'un coup (verset / demi-page / page / 2 pages).
    setRevealed((prev) => {
      const n = new Set(prev);
      chunk.forEach((v) => n.add(v.verseKey));
      return n;
    });
    followPage(chunk[0].page);
    let vi = 0;
    const playNext = () => {
      if (!runningRef.current) return;
      if (vi >= chunk.length) {
        // Boucle activée → on rejoue la même sélection jusqu'à désactivation.
        if (loopRef.current) {
          vi = 0;
          playNext();
          return;
        }
        onDone();
        return;
      }
      const v = chunk[vi];
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
      if (pausedRef.current) return; // décompte gelé en pause
      rem -= 1;
      setCountdown(rem);
      if (rem <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        onDone();
      }
    }, 1000);
  }

  // Pause / reprise (récitation ou décompte).
  function togglePause() {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      if (sub === 'recite') audioRef.current?.play().catch(() => {});
    } else {
      pausedRef.current = true;
      setPaused(true);
      if (sub === 'recite') audioRef.current?.pause();
    }
  }

  // Active/désactive la répétition en boucle de la sélection en cours.
  function toggleLoop() {
    const v = !loopRef.current;
    loopRef.current = v;
    setLoop(v);
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
    pendingRef.current = () => runAction(k + 1);
    if (a.type === 'recite') reciteChunk(a.chunk, goNext);
    else doGap(goNext);
  }

  // Passe à l'action suivante (idempotent : ne s'exécute qu'une fois).
  function goNext() {
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (fn) fn();
  }

  // Bouton « Suivant » : saute la récitation OU le décompte en cours.
  function skipToNext() {
    if (!runningRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
    }
    pausedRef.current = false;
    setPaused(false);
    goNext();
  }

  function finish() {
    runningRef.current = false;
    pausedRef.current = false;
    loopRef.current = false;
    pendingRef.current = null;
    audioRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    setPaused(false);
    setLoop(false);
    setCurrentVerse(null);
    setPhase('done');
  }

  function stop() {
    runningRef.current = false;
    pausedRef.current = false;
    loopRef.current = false;
    pendingRef.current = null;
    audioRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    setPaused(false);
    setLoop(false);
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
    // Mémorise la config pour la prochaine ouverture.
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({ startPage: lo, endPage: hi, unit, interval, who, rate }));
    } catch {
      /* ignore */
    }
    // Débloque l'audio DANS le geste utilisateur (avant tout await réseau),
    // sinon la lecture de la récitation sera bloquée par le navigateur.
    try {
      const a0 = ensureAudio();
      a0.src = SILENT_WAV;
      a0.play()
        .then(() => {
          if (a0.src === SILENT_WAV) a0.pause();
        })
        .catch(() => {});
    } catch {
      /* ignore */
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
    pausedRef.current = false;
    loopRef.current = false;
    pendingRef.current = null;
    setPaused(false);
    setLoop(false);
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
                    {speedLabel(s)}
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
      <div dir="ltr" className="app-topbar flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
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
          highlightedVerseKey={sub === 'recite' && !paused ? undefined : (currentVerse ?? undefined)}
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
            <span className={`text-7xl sm:text-8xl font-bold tabular-nums ${paused ? 'text-[#7a5d2c]' : 'text-[#2d5016]'}`}>
              {fmt(Math.max(0, countdown))}
            </span>
            {paused && <span className="mt-2 text-sm font-bold text-[#7a3030]">⏸ En pause</span>}
          </div>
        )}
      </div>

      {/* Contrôles : vitesse en direct + gros boutons */}
      <div className="flex-none bg-[#2d5016] px-3 py-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-[#c9a959] mr-1">Vitesse</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setRate(s)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-bold ${
                rate === s ? 'bg-[#c9a959] text-[#2d5016]' : 'bg-[#1f3a0f] text-[#c9a959]'
              }`}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={toggleLoop}
            aria-label="Répéter en boucle"
            title="Répéter en boucle la sélection en cours"
            className={`flex-none w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border-2 active:scale-95 transition-all ${
              loop ? 'bg-[#c9a959] text-[#2d5016] border-[#c9a959]' : 'bg-[#1f3a0f] text-[#c9a959] border-[#c9a959]/40'
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button
            onClick={togglePause}
            className="flex-1 max-w-[200px] py-3.5 rounded-2xl text-base font-bold text-[#2d5016] bg-[#c9a959] active:scale-95 shadow-lg flex items-center justify-center gap-2"
          >
            {paused ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Reprendre
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                Pause
              </>
            )}
          </button>
          <button
            onClick={skipToNext}
            className="flex-1 max-w-[220px] py-3.5 rounded-2xl text-base font-bold text-white bg-[#4a7c23] active:scale-95 shadow-lg flex items-center justify-center gap-2"
          >
            Suivant
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
