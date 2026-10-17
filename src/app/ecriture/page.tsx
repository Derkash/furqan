'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MushafPage from '@/components/MushafPage';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import type { PageVerses } from '@/types';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import { useOrientation } from '@/hooks/useOrientation';
import { applyOrientationPref } from '@/utils/orientation';
import { loadStrokes, saveStrokes, type Stroke, type TraceTool } from '@/utils/traceStore';

/**
 * Exercice « Écriture » (iPad + Apple Pencil) : la page du Mushaf est affichée
 * avec ses MOTS en très faible contraste ; on écrit le Coran par-dessus au
 * stylet. Tracés vectoriels enregistrés par page (IndexedDB), pression du
 * Pencil, outil calame (largeur selon la direction, façon qalam), gomme,
 * couleurs, épaisseur, annuler / rétablir, modèle réglable ou masqué
 * (écrire de mémoire) avec « Révéler » au maintien, stylet seul (paume ignorée).
 */

const COLORS = [
  { c: '#1b1b1b', name: 'Encre' },
  { c: '#1d3557', name: 'Bleu nuit' },
  { c: '#2d5016', name: 'Vert' },
  { c: '#b42318', name: 'Rouge' },
  { c: '#a77b2a', name: 'Or' },
  { c: '#5b3a8c', name: 'Violet' },
];
const PREFS_KEY = 'almuraja3a:ecriture-prefs';
const NIB_ANGLE = 0.95; // angle de la plume du calame (rad)
const SIZE_UNIT = 0.0016; // taille 1 = 0,16 % de la largeur de page

type GuideMode = 'text' | 'signs';

interface Prefs {
  page: number;
  tool: TraceTool;
  color: string;
  size: number;
  guide: number; // mode Texte : opacité des mots (0..0.6) ; mode Signes : opacité des lettres
  guideMode: GuideMode; // 'signs' = chakl + signes de pause visibles, lettres transparentes
  penOnly: boolean;
}
const DEFAULT_PREFS: Prefs = { page: 1, tool: 'calame', color: COLORS[0].c, size: 4, guide: 0.14, guideMode: 'text', penOnly: false };

// Mode « Signes seuls » : police Amiri Quran COLORÉE (OFL), retouchée pour
// l'app (public/fonts/AmiriQuranSignes.ttf). Chaque SIGNE (harakat, chadda,
// soukoun, signes de pause, petites lettres) est un calque de couleur (palette
// 0-3) ; le corps des lettres suit la couleur du texte et leurs POINTS ont été
// déplacés sur l'entrée 4 de la palette. Une seule couche de texte : on rend
// les lettres (couleur + entrée 4) transparentes et les signes foncés, sans
// aucun décalage possible.
const SIGN_INK = '#1a1a1a';

interface QcfLine {
  line: number;
  type: string;
  words?: { verseKey: string; position: number; isAyahMarker: boolean }[];
}

/** Ligne du mode « Signes seuls » (une seule couche, police colorée). */
function SignsLine({ words }: { words: { k: string; t: string }[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Réduit la police si la ligne déborde.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    const over = el.scrollWidth / Math.max(1, el.clientWidth);
    if (over > 1.001) el.style.fontSize = `calc(var(--signs-size) / ${over.toFixed(3)})`;
  });
  return (
    <div ref={ref} dir="rtl" className="signs-line">
      {words.map((w) => (
        <span key={w.k} className="signs-word">
          {w.t}
        </span>
      ))}
    </div>
  );
}

type Action = { type: 'add'; stroke: Stroke } | { type: 'clear'; prev: Stroke[] };

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Largeur d'un segment selon l'outil, la pression et la direction. */
function segWidth(s: Stroke, W: number, x0: number, y0: number, x1: number, y1: number, pr: number) {
  const base = s.w * W;
  if (s.t === 'erase') return base * 3.2;
  if (s.t === 'pen') return base * (0.35 + 0.95 * pr);
  // Calame : fin dans l'axe de la plume, large en travers.
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const k = Math.abs(Math.sin(ang - NIB_ANGLE));
  return base * (0.22 + 0.95 * k) * (0.75 + 0.5 * pr);
}

/** Dessine le segment i (entre les points i-1 et i) d'un tracé, lissé. */
function drawSeg(ctx: CanvasRenderingContext2D, s: Stroke, i: number, W: number, H: number) {
  const p = s.p;
  const px = (j: number) => p[j * 3] * W;
  const py = (j: number) => p[j * 3 + 1] * H;
  const pr = (j: number) => p[j * 3 + 2];
  ctx.globalCompositeOperation = s.t === 'erase' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.c;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const x1 = px(i), y1 = py(i), x0 = px(i - 1), y0 = py(i - 1);
  ctx.lineWidth = Math.max(0.6, segWidth(s, W, x0, y0, x1, y1, (pr(i) + pr(i - 1)) / 2));
  ctx.beginPath();
  if (i === 1) {
    ctx.moveTo(x0, y0);
    ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
  } else {
    const xa = px(i - 2), ya = py(i - 2);
    ctx.moveTo((xa + x0) / 2, (ya + y0) / 2);
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.stroke();
}

function drawDot(ctx: CanvasRenderingContext2D, s: Stroke, W: number, H: number) {
  ctx.globalCompositeOperation = s.t === 'erase' ? 'destination-out' : 'source-over';
  ctx.fillStyle = s.c;
  const r = Math.max(0.6, segWidth(s, W, 0, 0, 1, 0, s.p[2])) / 2;
  ctx.beginPath();
  ctx.arc(s.p[0] * W, s.p[1] * H, r, 0, Math.PI * 2);
  ctx.fill();
}

export default function EcriturePage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [verses, setVerses] = useState<PageVerses | null>(null);
  const [lines, setLines] = useState<QcfLine[]>([]);
  const [uthmani, setUthmani] = useState<Record<string, string> | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  const [reveal, setReveal] = useState(false);
  const [hideGuide, setHideGuide] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [pageInput, setPageInput] = useState('');
  // Zone d'écriture = bloc de texte de la page (px, relatif à la page).
  const [zone, setZone] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const orientation = useOrientation();

  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<{ stroke: Stroke; id: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeen = useRef(false);

  const { page, tool, color, size, guide, guideMode, penOnly } = prefs;
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  // Portrait imposé pendant l'exercice (app native) ; préférence rétablie en sortant.
  useEffect(() => {
    void applyOrientationPref('portrait');
    return () => {
      void applyOrientationPref();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* stockage indisponible */
    }
  }, [prefs, ready]);

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { W, H } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const s of strokesRef.current) {
      const n = s.p.length / 3;
      if (n === 1) drawDot(ctx, s, W, H);
      for (let i = 1; i < n; i++) drawSeg(ctx, s, i, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  // Mesure de la zone de texte de la page (et taille du canevas qui la couvre).
  const measure = useCallback(() => {
    const box = boxRef.current;
    const content = box?.querySelector('.mushaf-content') as HTMLElement | null;
    if (!box || !content) return;
    const b = box.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const z = { left: c.left - b.left, top: c.top - b.top, width: c.width, height: c.height };
    if (z.width < 10 || z.height < 10) return;
    setZone((prev) =>
      prev && Math.abs(prev.width - z.width) < 0.5 && Math.abs(prev.height - z.height) < 0.5 && Math.abs(prev.left - z.left) < 0.5 && Math.abs(prev.top - z.top) < 0.5
        ? prev
        : z
    );
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    const t = setTimeout(measure, 50);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure, ready, page]);

  // Le canevas suit la zone.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !zone) return;
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { W: zone.width, H: zone.height };
    cv.width = Math.round(zone.width * dpr);
    cv.height = Math.round(zone.height * dpr);
    redraw();
  }, [zone, redraw]);

  // Changement de page : versets, lignes, texte Uthmani, tracés enregistrés.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const padded = String(page).padStart(3, '0');
    fetchPageVerses(page).then((v) => !cancelled && setVerses(v));
    fetch(`/qcf-data/page-${padded}.json`)
      .then((r) => r.json())
      .then((d) => !cancelled && setLines(Array.isArray(d.lines) ? d.lines : []))
      .catch(() => !cancelled && setLines([]));
    setUthmani(null);
    fetch(`/uthmani/page-${padded}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setUthmani(d))
      .catch(() => {});
    loadStrokes(page).then((st) => {
      if (cancelled) return;
      strokesRef.current = st;
      setStrokes(st);
      setUndoStack([]);
      setRedoStack([]);
      setConfirmClear(false);
      redraw();
    });
    return () => {
      cancelled = true;
    };
  }, [page, ready, redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persist = (next: Stroke[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const p = page;
    saveTimer.current = setTimeout(() => void saveStrokes(p, next), 500);
  };

  const commit = (next: Stroke[], action: Action) => {
    strokesRef.current = next;
    setStrokes(next);
    setUndoStack((u) => [...u, action].slice(-200));
    setRedoStack([]);
    persist(next);
  };

  // ---- Saisie au stylet (coordonnées normalisées sur la ZONE de texte) ----
  const point = (e: PointerEvent | React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Number(pressure.toFixed(3))];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen' && !penSeen.current) {
      penSeen.current = true;
      if (!penOnly) setPref('penOnly', true); // paume ignorée dès qu'un stylet est vu
    }
    if (penOnly && e.pointerType === 'touch') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y, p] = point(e);
    const stroke: Stroke = { t: tool, c: color, w: size * SIZE_UNIT, p: [x, y, p] };
    liveRef.current = { stroke, id: e.pointerId };
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawDot(ctx, stroke, sizeRef.current.W, sizeRef.current.H);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      const r = canvasRef.current!.getBoundingClientRect();
      setHover({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
    const live = liveRef.current;
    if (!live || live.id !== e.pointerId) return;
    const ctx = canvasRef.current?.getContext('2d');
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const { W, H } = sizeRef.current;
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y, p] = point(ev);
      const s = live.stroke;
      const n = s.p.length / 3;
      const lx = s.p[(n - 1) * 3], ly = s.p[(n - 1) * 3 + 1];
      if (Math.hypot((x - lx) * W, (y - ly) * H) < 0.7) continue;
      s.p.push(Number(x.toFixed(5)), Number(y.toFixed(5)), p);
      if (ctx) drawSeg(ctx, s, s.p.length / 3 - 1, W, H);
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    if (!live || live.id !== e.pointerId) return;
    liveRef.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.globalCompositeOperation = 'source-over';
    commit([...strokesRef.current, live.stroke], { type: 'add', stroke: live.stroke });
  };

  const undo = () => {
    const a = undoStack[undoStack.length - 1];
    if (!a) return;
    const next = a.type === 'add' ? strokesRef.current.slice(0, -1) : a.prev;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, a]);
    strokesRef.current = next;
    setStrokes(next);
    persist(next);
  };
  const redo = () => {
    const a = redoStack[redoStack.length - 1];
    if (!a) return;
    const next = a.type === 'add' ? [...strokesRef.current, a.stroke] : [];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, a]);
    strokesRef.current = next;
    setStrokes(next);
    persist(next);
  };
  const clearPage = () => {
    if (!strokesRef.current.length) return;
    commit([], { type: 'clear', prev: strokesRef.current });
    setConfirmClear(false);
  };

  const goPage = (p: number) => {
    if (!Number.isFinite(p) || p < 1) return;
    const n = Math.max(1, Math.min(604, Math.round(p)));
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      void saveStrokes(page, strokesRef.current);
    }
    setPref('page', n);
  };
  const submitPage = () => {
    const n = Number(pageInput.replace(/[^\d]/g, ''));
    if (n) goPage(n);
    setPageInput('');
  };

  // Opacités : mode Texte = mots QCF ; mode Signes = mots QCF cachés, lettres Unicode réglables.
  const textOpacity = guideMode === 'signs' ? 0 : reveal ? 1 : hideGuide ? 0 : guide;
  const letterOpacity = reveal ? 1 : hideGuide ? 0 : guide;
  const brushPx = Math.max(3, size * SIZE_UNIT * (zone?.width ?? 0) * (tool === 'erase' ? 3.2 : 1));

  const railBtn = (active: boolean) =>
    `flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-xl text-[8px] font-bold uppercase tracking-wide transition-colors disabled:opacity-35 ${
      active ? 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]' : 'text-[var(--ds-n500)] hover:text-[var(--ds-green)]'
    }`;
  const ico = (d: React.ReactNode) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
  const sep = <div className="w-9 h-px bg-[var(--ds-divider)] my-1 flex-none" />;
  const step = (label: string, value: string, dec: () => void, inc: () => void) => (
    <div className="flex flex-col items-center w-14 flex-none">
      <span className="text-[8px] font-bold uppercase tracking-wide text-[var(--ds-n500)]">{label}</span>
      <div className="flex items-center gap-0.5">
        <button onClick={dec} className="w-5 h-6 rounded-md text-[var(--ds-green)] font-bold" aria-label={`${label} moins`}>−</button>
        <span className="text-[11px] font-bold tabular-nums text-[var(--ds-text)] w-6 text-center">{value}</span>
        <button onClick={inc} className="w-5 h-6 rounded-md text-[var(--ds-green)] font-bold" aria-label={`${label} plus`}>+</button>
      </div>
    </div>
  );

  // Mots Uthmani par ligne (mode Signes).
  const signLines = lines.map((l) => ({
    line: l.line,
    words: (l.words ?? [])
      .filter((w) => !w.isAyahMarker)
      .map((w) => ({ k: `${w.verseKey}:${w.position}`, t: uthmani?.[`${w.verseKey}:${w.position}`] ?? '' }))
      .filter((w) => w.t),
  }));
  const lineCount = Math.max(15, lines.length);

  if (!ready) return <div className="ds-page" />;

  return (
    <div dir="ltr" className="h-dvh w-full flex overflow-hidden bg-[var(--ds-green-deep)] select-none" style={{ fontFamily: 'var(--ds-font)', WebkitTouchCallout: 'none' }}>
      <style>{`
        .trace-guide .verse-word { color: rgba(26, 26, 26, var(--guide)) !important; transition: color .2s ease; }
        @font-face { font-family: 'AmiriQuranSignes'; src: url('/fonts/AmiriQuranSignes.ttf') format('truetype'); font-display: block; }
        @font-palette-values --signes {
          font-family: 'AmiriQuranSignes';
          override-colors: 0 ${SIGN_INK}, 1 ${SIGN_INK}, 2 ${SIGN_INK}, 3 ${SIGN_INK}, 4 rgba(26, 26, 26, ${letterOpacity});
        }
        .signs-line { position: absolute; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center;
          white-space: nowrap; font-family: 'AmiriQuranSignes', serif; font-palette: --signes;
          color: rgba(26, 26, 26, ${letterOpacity}); font-size: var(--signs-size); line-height: 1.9; }
        .signs-word { white-space: nowrap; }
      `}</style>

      {/* ---- Rail d'outils (gauche), comme la Lecture ---- */}
      <aside dir="ltr" className="flex w-[68px] flex-none flex-col items-center bg-white overflow-y-auto py-3 gap-1 z-40">
        <Link href="/exercises" title="Accueil" className="flex flex-col items-center gap-0.5 mb-1 flex-none">
          <span className="text-[20px] leading-none text-[var(--ds-gold)]" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>ع</span>
          <span className="text-[6px] font-extrabold tracking-[0.16em] text-[var(--ds-n600)]">MURAJA3A</span>
        </Link>

        {/* Page */}
        <div className="flex flex-col items-center gap-1 flex-none">
          <span className="text-[8px] font-bold uppercase tracking-wide text-[var(--ds-n500)]">Page</span>
          <input
            id="ecriture-page"
            type="text"
            inputMode="numeric"
            enterKeyHint="go"
            value={pageInput}
            placeholder={String(page)}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                submitPage();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-14 h-9 rounded-lg border-2 border-[var(--ds-gold)]/40 text-center text-[14px] font-bold outline-none focus:border-[var(--ds-gold)] placeholder:text-[var(--ds-text)]"
            aria-label="Numéro de page"
          />
          {pageInput ? (
            <button onClick={submitPage} className="w-14 h-7 rounded-lg bg-[var(--ds-green)] text-white text-[11px] font-bold">Aller</button>
          ) : (
            <div className="flex gap-1">
              <button onClick={() => goPage(page + 1)} disabled={page >= 604} className="w-6 h-7 rounded-lg bg-[var(--ds-sage-100)] text-[var(--ds-green)] disabled:opacity-35" aria-label="Page suivante">‹</button>
              <button onClick={() => goPage(page - 1)} disabled={page <= 1} className="w-6 h-7 rounded-lg bg-[var(--ds-sage-100)] text-[var(--ds-green)] disabled:opacity-35" aria-label="Page précédente">›</button>
            </div>
          )}
        </div>
        {sep}

        {/* Outils */}
        <button className={railBtn(tool === 'calame')} onClick={() => setPref('tool', 'calame')} title="Calame (largeur selon la direction)">
          {ico(<><path d="M4 20 15 9" /><path d="m13 7 4-4 4 4-4 4" /></>)}Calame
        </button>
        <button className={railBtn(tool === 'pen')} onClick={() => setPref('tool', 'pen')} title="Stylo (pression)">
          {ico(<path d="M4 20h4L19 9l-4-4L4 16v4Z" />)}Stylo
        </button>
        <button className={railBtn(tool === 'erase')} onClick={() => setPref('tool', 'erase')} title="Gomme">
          {ico(<><path d="m7 21-4-4 11-11 7 7-7 8H7Z" /><path d="M22 21H7" /></>)}Gomme
        </button>

        {/* Couleurs */}
        <div className="grid grid-cols-2 gap-1.5 py-1 flex-none">
          {COLORS.map((k) => (
            <button
              key={k.c}
              onClick={() => {
                setPref('color', k.c);
                if (tool === 'erase') setPref('tool', 'calame');
              }}
              aria-label={k.name}
              title={k.name}
              className="w-5 h-5 rounded-full"
              style={{ background: k.c, boxShadow: color === k.c && tool !== 'erase' ? `0 0 0 2px #fff, 0 0 0 3.5px ${k.c}` : 'none' }}
            />
          ))}
        </div>
        {step('Épaisseur', String(size), () => setPref('size', Math.max(1, size - 0.5)), () => setPref('size', Math.min(12, size + 0.5)))}
        {sep}

        <button className={railBtn(false)} onClick={undo} disabled={!undoStack.length} title="Annuler">
          {ico(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>)}Annuler
        </button>
        <button className={railBtn(false)} onClick={redo} disabled={!redoStack.length} title="Rétablir">
          {ico(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>)}Rétablir
        </button>
        {!confirmClear ? (
          <button className={railBtn(false)} onClick={() => setConfirmClear(true)} disabled={!strokes.length} title="Effacer la page">
            {ico(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>)}Effacer
          </button>
        ) : (
          <div className="flex flex-col gap-1 flex-none">
            <button onClick={clearPage} className="w-14 py-1.5 rounded-lg bg-red-600 text-white text-[9px] font-bold">Effacer ?</button>
            <button onClick={() => setConfirmClear(false)} className="w-14 py-1 rounded-lg bg-[var(--ds-sage-100)] text-[var(--ds-n700)] text-[9px] font-bold">Non</button>
          </div>
        )}
        {sep}

        {/* Modèle */}
        <button className={railBtn(guideMode === 'text')} onClick={() => setPref('guideMode', 'text')} title="Modèle : texte du Mushaf en transparence">
          {ico(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></>)}Texte
        </button>
        <button className={railBtn(guideMode === 'signs')} onClick={() => setPref('guideMode', 'signs')} title="Modèle : chakl et signes de pause visibles, lettres transparentes">
          {ico(<><circle cx="7" cy="7" r="1.5" fill="currentColor" /><path d="M12 6h6" /><circle cx="16" cy="17" r="1.5" fill="currentColor" /><path d="M5 17h6" /></>)}Signes
        </button>
        {step(guideMode === 'signs' ? 'Lettres' : 'Contraste', `${Math.round(guide * 100)}`, () => setPref('guide', Math.max(guideMode === 'signs' ? 0 : 0.03, Number((guide - 0.03).toFixed(2)))), () => setPref('guide', Math.min(0.6, Number((guide + 0.03).toFixed(2)))))}
        <button className={railBtn(hideGuide)} onClick={() => setHideGuide((v) => !v)} title="Écrire de mémoire">
          {ico(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><path d="M3 3l18 18" /></>)}{hideGuide ? 'Masqué' : 'Masquer'}
        </button>
        <button
          className={railBtn(reveal)}
          onPointerDown={() => setReveal(true)}
          onPointerUp={() => setReveal(false)}
          onPointerLeave={() => setReveal(false)}
          onPointerCancel={() => setReveal(false)}
          title="Maintenir pour voir le modèle en clair"
        >
          {ico(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>)}Révéler
        </button>
        {sep}
        <button className={railBtn(penOnly)} onClick={() => setPref('penOnly', !penOnly)} title="Ignorer les doigts et la paume">
          {ico(<><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></>)}Stylet seul
        </button>
      </aside>

      {/* ---- Page + zone d'écriture ---- */}
      <div className="flex-1 min-w-0 h-full flex items-center justify-center p-2 relative">
        <div
          ref={boxRef}
          className="trace-guide relative h-full max-w-full"
          style={{ aspectRatio: '759 / 1080', ['--guide' as string]: String(textOpacity) }}
        >
          <MushafPage pageNumber={page} pageVerses={verses} loading={!verses} />

          {zone && (
            <>
              {/* Mode « Signes seuls » : chakl + signes visibles, lettres transparentes */}
              {guideMode === 'signs' && (
                <div
                  className="absolute z-[15] pointer-events-none"
                  style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height, ['--signs-size' as string]: `${(zone.height / lineCount) * 0.52}px` }}
                >
                  {signLines.map((l) => (
                    <div key={l.line} style={{ position: 'absolute', left: 0, right: 0, top: `${((l.line - 1) * 100) / lineCount}%`, height: `${100 / lineCount}%` }}>
                      {l.words.length > 0 && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                          <SignsLine words={l.words} />
                        </div>
                      )}
                    </div>
                  ))}
                  {!uthmani && <p className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--ds-n500)]">Chargement du texte…</p>}
                </div>
              )}

              {/* Contour de la zone d'écriture : seule cette zone reçoit le stylet */}
              <div
                aria-hidden
                className="absolute z-[18] pointer-events-none rounded-md"
                style={{ left: zone.left - 4, top: zone.top - 4, width: zone.width + 8, height: zone.height + 8, border: '1.5px dashed rgba(167, 123, 42, 0.55)' }}
              />
              <canvas
                ref={canvasRef}
                className="absolute z-20"
                style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height, touchAction: 'none', cursor: 'none' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'touch') setHover(null);
                }}
              />
              {hover && (
                <span
                  aria-hidden
                  className="absolute z-30 rounded-full pointer-events-none"
                  style={{
                    left: zone.left + hover.x,
                    top: zone.top + hover.y,
                    width: brushPx,
                    height: brushPx,
                    transform: 'translate(-50%, -50%)',
                    border: `1.5px solid ${tool === 'erase' ? '#6b7280' : color}`,
                    background: tool === 'erase' ? 'rgba(255,255,255,0.4)' : 'transparent',
                  }}
                />
              )}
            </>
          )}
          <span className="absolute bottom-1 right-2 z-30 text-[10px] font-bold text-[var(--ds-n500)] pointer-events-none">p. {toArabicNumbers(page)}</span>
        </div>

        {/* Paysage : l'exercice se fait en portrait */}
        {orientation === 'landscape' && (
          <div className="absolute inset-0 z-50 bg-[var(--ds-green-deep)]/95 flex flex-col items-center justify-center text-center p-6 text-white">
            <p className="text-lg font-bold mb-1">Tourne l’iPad en portrait</p>
            <p className="text-sm opacity-80">L’exercice d’écriture se fait page entière, en portrait.</p>
          </div>
        )}
      </div>
    </div>
  );
}
