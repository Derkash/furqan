'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MushafPage from '@/components/MushafPage';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import type { PageVerses } from '@/types';
import { toArabicNumbers } from '@/utils/arabicNumbers';
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

interface Prefs {
  page: number;
  tool: TraceTool;
  color: string;
  size: number;
  guide: number; // opacité des mots du modèle (0..0.6)
  penOnly: boolean;
}
const DEFAULT_PREFS: Prefs = { page: 1, tool: 'calame', color: COLORS[0].c, size: 4, guide: 0.14, penOnly: false };

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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  const [reveal, setReveal] = useState(false);
  const [hideGuide, setHideGuide] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [gotoPage, setGotoPage] = useState('');
  const [pageW, setPageW] = useState(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<{ stroke: Stroke; id: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeen = useRef(false);

  const { page, tool, color, size, guide, penOnly } = prefs;
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* stockage indisponible */
    }
  }, [prefs, ready]);

  // Redessine tout (changement de page, taille, annuler…).
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

  // Taille du canevas = taille de la page affichée (retina).
  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    if (!box || !cv) return;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { W: r.width, H: r.height };
      setPageW(r.width);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      redraw();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [redraw, ready]);

  // Changement de page : versets (pour le rendu) + tracés enregistrés.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetchPageVerses(page).then((v) => !cancelled && setVerses(v));
    loadStrokes(page).then((s) => {
      if (cancelled) return;
      strokesRef.current = s;
      setStrokes(s);
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

  // ---- Saisie au stylet ----
  const point = (e: PointerEvent | React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
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
      const r = boxRef.current!.getBoundingClientRect();
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
      if (Math.hypot((x - lx) * W, (y - ly) * H) < 0.7) continue; // filtre le bruit
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

  // ---- Historique ----
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
    const n = Math.max(1, Math.min(604, p));
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      void saveStrokes(page, strokesRef.current); // pas de perte en changeant de page
    }
    setPref('page', n);
  };

  const guideOpacity = reveal ? 1 : hideGuide ? 0 : guide;
  const brushPx = Math.max(3, size * SIZE_UNIT * pageW * (tool === 'erase' ? 3.2 : 1));

  const btn = (active: boolean) =>
    `h-9 min-w-9 px-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
      active ? 'bg-[var(--ds-green)] text-white' : 'bg-white text-[var(--ds-n700)] border border-[var(--ds-divider)] hover:bg-[var(--ds-sage-100)]'
    }`;
  const ico = (d: React.ReactNode) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );

  if (!ready) return <div className="ds-page" />;

  return (
    <div className="h-dvh w-full flex flex-col bg-[var(--ds-bg)] overflow-hidden select-none" style={{ fontFamily: 'var(--ds-font)', WebkitTouchCallout: 'none' }}>
      <style>{`
        .trace-guide .verse-word { color: rgba(26, 26, 26, var(--guide)) !important; transition: color .2s ease; }
        .trace-guide .verse-word.ayah-marker { color: rgba(26, 26, 26, calc(var(--guide) * 1.3)) !important; }
      `}</style>

      {/* Barre d'outils */}
      <div dir="ltr" className="flex-none flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--ds-bg)] border-b border-[var(--ds-divider)]">
        <Link href="/exercises" aria-label="Retour" className="h-9 w-9 rounded-full bg-[var(--ds-green)] text-white flex items-center justify-center">
          {ico(<path d="m15 18-6-6 6-6" />)}
        </Link>

        {/* Outils */}
        <div className="flex gap-1">
          <button className={btn(tool === 'calame')} onClick={() => setPref('tool', 'calame')} title="Calame (largeur selon la direction)">
            {ico(<><path d="M4 20 15 9" /><path d="m13 7 4-4 4 4-4 4" /></>)}
            Calame
          </button>
          <button className={btn(tool === 'pen')} onClick={() => setPref('tool', 'pen')} title="Stylo (pression du stylet)">
            {ico(<><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></>)}
            Stylo
          </button>
          <button className={btn(tool === 'erase')} onClick={() => setPref('tool', 'erase')} title="Gomme">
            {ico(<><path d="m7 21-4-4 11-11 7 7-7 8H7Z" /><path d="M22 21H7" /></>)}
            Gomme
          </button>
        </div>

        {/* Couleurs */}
        <div className="flex gap-1.5 items-center px-1">
          {COLORS.map((k) => (
            <button
              key={k.c}
              onClick={() => {
                setPref('color', k.c);
                if (tool === 'erase') setPref('tool', 'calame');
              }}
              aria-label={k.name}
              title={k.name}
              className="w-7 h-7 rounded-full transition-transform"
              style={{
                background: k.c,
                boxShadow: color === k.c && tool !== 'erase' ? '0 0 0 2px var(--ds-bg), 0 0 0 4px ' + k.c : 'none',
                transform: color === k.c && tool !== 'erase' ? 'scale(1.05)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Épaisseur */}
        <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--ds-n600)]">
          Épaisseur
          <input
            id="ecriture-size"
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={size}
            onChange={(e) => setPref('size', Number(e.target.value))}
            className="w-24 accent-[var(--ds-green)]"
          />
        </label>

        {/* Historique */}
        <div className="flex gap-1">
          <button className={btn(false)} onClick={undo} disabled={!undoStack.length} title="Annuler" aria-label="Annuler">
            {ico(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>)}
          </button>
          <button className={btn(false)} onClick={redo} disabled={!redoStack.length} title="Rétablir" aria-label="Rétablir">
            {ico(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>)}
          </button>
          {!confirmClear ? (
            <button className={btn(false)} onClick={() => setConfirmClear(true)} disabled={!strokes.length} title="Effacer la page">
              {ico(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>)}
              Effacer
            </button>
          ) : (
            <span className="flex gap-1">
              <button className="h-9 px-2.5 rounded-xl text-[12px] font-bold bg-red-600 text-white" onClick={clearPage}>
                Effacer la page
              </button>
              <button className={btn(false)} onClick={() => setConfirmClear(false)}>
                Annuler
              </button>
            </span>
          )}
        </div>

        {/* Modèle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--ds-n600)]">
            Modèle
            <input
              id="ecriture-guide"
              type="range"
              min={0.03}
              max={0.6}
              step={0.01}
              value={guide}
              disabled={hideGuide}
              onChange={(e) => setPref('guide', Number(e.target.value))}
              className="w-24 accent-[var(--ds-gold)]"
            />
          </label>
          <button className={btn(hideGuide)} onClick={() => setHideGuide((v) => !v)} title="Écrire de mémoire (modèle masqué)">
            {hideGuide ? 'Masqué' : 'Masquer'}
          </button>
          <button
            className={btn(reveal)}
            onPointerDown={() => setReveal(true)}
            onPointerUp={() => setReveal(false)}
            onPointerLeave={() => setReveal(false)}
            onPointerCancel={() => setReveal(false)}
            title="Maintenir pour voir le modèle en clair"
          >
            Révéler
          </button>
        </div>

        <button className={btn(penOnly)} onClick={() => setPref('penOnly', !penOnly)} title="Ignorer les doigts et la paume">
          {ico(<><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></>)}
          Stylet seul
        </button>

        {/* Pages (RTL : suivante à gauche) */}
        <div className="flex items-center gap-1 ml-auto">
          <button className={btn(false)} onClick={() => goPage(page + 1)} disabled={page >= 604} aria-label="Page suivante">
            {ico(<path d="m15 18-6-6 6-6" />)}
          </button>
          <input
            id="ecriture-page"
            type="number"
            inputMode="numeric"
            min={1}
            max={604}
            value={gotoPage}
            placeholder={String(page)}
            onChange={(e) => setGotoPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number(gotoPage);
                if (n) goPage(n);
                setGotoPage('');
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={() => {
              const n = Number(gotoPage);
              if (n) goPage(n);
              setGotoPage('');
            }}
            className="w-14 h-9 px-1 rounded-xl border border-[var(--ds-divider)] text-center text-[13px] font-bold outline-none focus:border-[var(--ds-gold)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title="Aller à la page"
          />
          <button className={btn(false)} onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="Page précédente">
            {ico(<path d="m9 18 6-6-6-6" />)}
          </button>
        </div>
      </div>

      {/* Page + couche d'écriture */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        <div
          ref={boxRef}
          className="trace-guide relative h-full max-w-full"
          style={{ aspectRatio: '759 / 1080', ['--guide' as string]: String(guideOpacity) }}
        >
          <MushafPage pageNumber={page} pageVerses={verses} loading={!verses} />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-20"
            style={{ touchAction: 'none', cursor: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'touch') setHover(null);
            }}
          />
          {/* Aperçu du pinceau au survol du Pencil */}
          {hover && (
            <span
              aria-hidden
              className="absolute z-30 rounded-full pointer-events-none"
              style={{
                left: hover.x,
                top: hover.y,
                width: brushPx,
                height: brushPx,
                transform: 'translate(-50%, -50%)',
                border: `1.5px solid ${tool === 'erase' ? '#6b7280' : color}`,
                background: tool === 'erase' ? 'rgba(255,255,255,0.4)' : 'transparent',
              }}
            />
          )}
          <span className="absolute bottom-1 right-2 z-30 text-[10px] font-bold text-[var(--ds-n500)] pointer-events-none">
            p. {toArabicNumbers(page)}
          </span>
        </div>
      </div>
    </div>
  );
}
