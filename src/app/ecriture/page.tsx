'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MushafPage from '@/components/MushafPage';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import type { PageVerses } from '@/types';
import { applyOrientationPref } from '@/utils/orientation';
import { listenPencil, setScreenOrientation, type PencilEvent } from '@/utils/pencil';
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
type Assist = 'off' | 'light' | 'strong';

// Guidage : l'encre reste pleine SUR les lettres (+ une petite marge) et est
// seulement ATTÉNUÉE au-delà — rien n'est rempli automatiquement.
const ASSIST: Record<Exclude<Assist, 'off'>, { margin: number; outside: number; label: string }> = {
  light: { margin: 0.018, outside: 0.55, label: 'Léger' },
  strong: { margin: 0.012, outside: 0.3, label: 'Fort' },
};

interface Prefs {
  page: number;
  tool: TraceTool;
  color: string;
  size: number;
  guide: number; // mode Texte : opacité des mots (0..0.6) ; mode Signes : opacité des lettres
  guideMode: GuideMode; // 'signs' = chakl + signes de pause visibles, lettres transparentes
  penOnly: boolean;
  assist: Assist; // guidage anti-débordement
}
const DEFAULT_PREFS: Prefs = { page: 1, tool: 'calame', color: COLORS[0].c, size: 4, guide: 0.14, guideMode: 'text', penOnly: false, assist: 'light' };

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
  const r = Math.max(1.2, segWidth(s, W, 0, 0, 1, 0, Math.max(0.6, s.p[2]))) / 2;
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
  const [pageInput, setPageInput] = useState('');
  const [zone, setZone] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // Zoom / déplacement de la page (boutons, pincement, glisser au doigt).
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [renderZoom, setRenderZoom] = useState(1); // zoom « stable » pour la netteté des canevas
  const [base, setBase] = useState({ w: 0, h: 0, vw: 0, vh: 0 }); // page ajustée à l'écran (zoom 1)
  const [barsHidden, setBarsHidden] = useState(false);
  // « Ma copie » : calque du modèle retiré (texte ET signes) pour se relire,
  // encre affichée brute (sans l'atténuation du guidage).
  const [copyOnly, setCopyOnly] = useState(false);
  const copyOnlyRef = useRef(false);
  // Palette rapide (double toucher / pression du Pencil) : position écran.
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Portrait permanent : contre-rotation CSS si l'écran est malgré tout en paysage.
  const [rot, setRot] = useState(0);
  const rotRef = useRef(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // affichage
  const inkRef = useRef<HTMLCanvasElement | null>(null); // encre brute (hors écran)
  const maskRef = useRef<HTMLCanvasElement | null>(null); // masque de guidage (hors écran)
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef({ z: 1, x: 0, y: 0 });
  const fittedRef = useRef(false);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ z: number; x: number; y: number; mid: { x: number; y: number }; dist: number } | null>(null);
  const sizeRef = useRef({ W: 0, H: 0, dpr: 1 });
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<{ stroke: Stroke; id: number; sx: number; sy: number; sp: number; pred: number[] } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const compositeRef = useRef<(() => void) | null>(null);
  const penSeen = useRef(false);
  const prevToolRef = useRef<TraceTool>('calame');
  const maskOnRef = useRef(false);
  const zoneRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const { page, tool, color, size, guide, guideMode, penOnly, assist } = prefs;
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    zoneRef.current = zone;
  }, [zone]);
  useEffect(() => {
    copyOnlyRef.current = copyOnly;
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      compositeRef.current?.();
    });
  }, [copyOnly]);
  useEffect(() => {
    viewRef.current = view;
    const t = setTimeout(() => setRenderZoom(view.z), 180); // netteté après le geste
    return () => clearTimeout(t);
  }, [view]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 1300);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  // Portrait imposé pendant l'exercice (natif), puis comportement normal en sortant.
  useEffect(() => {
    setScreenOrientation('portrait');
    void applyOrientationPref('portrait');
    return () => {
      setScreenOrientation('default');
      void applyOrientationPref();
    };
  }, []);

  useEffect(() => {
    const compute = () => {
      if (window.innerWidth <= window.innerHeight) return 0;
      const wo = (window as unknown as { orientation?: number }).orientation;
      if (typeof wo === 'number') return wo === 90 ? -90 : 90;
      return screen.orientation?.angle === 90 ? -90 : 90;
    };
    const update = () => {
      const r = compute();
      rotRef.current = r;
      setRot(r);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
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

  // ---- Rendu : encre (hors écran) → affichage, avec masque de guidage ----
  const composite = useCallback(() => {
    rafRef.current = null;
    const cv = canvasRef.current;
    const ink = inkRef.current;
    if (!cv || !ink) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(ink, 0, 0);
    if (maskOnRef.current && maskRef.current && !copyOnlyRef.current) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskRef.current, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Trajectoire prédite (latence perçue plus faible), jamais enregistrée.
    const live = liveRef.current;
    if (live && live.pred.length >= 3 && live.stroke.t !== 'erase') {
      const { W, H, dpr } = sizeRef.current;
      const p = live.stroke.p;
      const n = p.length / 3;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = live.stroke.c;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.6, live.stroke.w * W * 0.8);
      ctx.beginPath();
      ctx.moveTo(p[(n - 1) * 3] * W, p[(n - 1) * 3 + 1] * H);
      for (let i = 0; i < live.pred.length; i += 3) ctx.lineTo(live.pred[i] * W, live.pred[i + 1] * H);
      ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }, []);

  useEffect(() => {
    compositeRef.current = composite;
  }, [composite]);

  const schedule = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(composite);
  }, [composite]);

  const inkCtx = () => {
    const ink = inkRef.current;
    const ctx = ink?.getContext('2d');
    if (!ctx) return null;
    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const redrawInk = useCallback(() => {
    const ctx = inkCtx();
    if (!ctx) return;
    const { W, H } = sizeRef.current;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    for (const s of strokesRef.current) {
      const n = s.p.length / 3;
      if (n === 1) drawDot(ctx, s, W, H);
      for (let i = 1; i < n; i++) drawSeg(ctx, s, i, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    schedule();
  }, [schedule]);

  // Masque de guidage : les mots du Mushaf redessinés (même police, même
  // place), épaissis d'une petite marge ; hors des lettres, encre atténuée.
  const buildMask = useCallback(() => {
    const box = boxRef.current;
    const m = maskRef.current;
    const z = zoneRef.current;
    const a = prefsRef.current.assist;
    if (!box || !m || !z || a === 'off') {
      maskOnRef.current = false;
      schedule();
      return;
    }
    const conf = ASSIST[a];
    const { W, H, dpr } = sizeRef.current;
    const ctx = m.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(0,0,0,${conf.outside})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = conf.margin * W * 2;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const words = Array.from(box.querySelectorAll<HTMLElement>('.verse-word:not(.ayah-marker)'));
    const offsetIn = (el: HTMLElement) => {
      let left = 0;
      let top = 0;
      let n: HTMLElement | null = el;
      while (n && n !== box) {
        left += n.offsetLeft;
        top += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      return n === box ? { left, top } : null;
    };
    // Ligne de base EXACTE de chaque mot : un repère de taille nulle aligné
    // sur la ligne de base (insérés puis lus en lot : une seule mise en page).
    const probes = words.map((el) => {
      const pr = document.createElement('span');
      pr.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
      el.appendChild(pr);
      return pr;
    });
    const pos = words.map((el, i) => ({ el, o: offsetIn(el), b: offsetIn(probes[i]) }));
    probes.forEach((pr) => pr.remove());
    for (const { el, o, b } of pos) {
      if (!o || !b) continue;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const t = el.textContent ?? '';
      const x = o.left - z.left;
      const y = b.top - z.top;
      ctx.fillText(t, x, y);
      ctx.strokeText(t, x, y);
    }
    maskOnRef.current = words.length > 0;
    schedule();
  }, [schedule]);

  // Page « contenue » dans la zone d'affichage (zoom 1).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      let h = vh;
      let w = (h * 759) / 1080;
      if (w > vw) {
        w = vw;
        h = (w * 1080) / 759;
      }
      setBase({ w, h, vw, vh });
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [ready]);

  // Mesure de la zone de texte (coordonnées de mise en page, insensibles à la rotation).
  const measure = useCallback(() => {
    const box = boxRef.current;
    const content = box?.querySelector('.mushaf-content') as HTMLElement | null;
    if (!box || !content) return;
    let left = 0;
    let top = 0;
    let n: HTMLElement | null = content;
    while (n && n !== box) {
      left += n.offsetLeft;
      top += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    const z = { left, top, width: content.offsetWidth, height: content.offsetHeight };
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

  // Canevas (affichage, encre, masque) à la taille de la zone, en retina.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !zone) return;
    // Résolution des canevas = écran × zoom (net en zoom), plafonnée (mémoire iOS).
    const cap = Math.sqrt(12e6 / Math.max(1, zone.width * zone.height));
    const dpr = Math.min((window.devicePixelRatio || 1) * Math.max(1, renderZoom), cap);
    sizeRef.current = { W: zone.width, H: zone.height, dpr };
    const w = Math.round(zone.width * dpr);
    const h = Math.round(zone.height * dpr);
    if (!inkRef.current) inkRef.current = document.createElement('canvas');
    if (!maskRef.current) maskRef.current = document.createElement('canvas');
    for (const c of [cv, inkRef.current, maskRef.current]) {
      c.width = w;
      c.height = h;
    }
    redrawInk();
    buildMask();
  }, [zone, renderZoom, redrawInk, buildMask]);

  // Le masque suit la page (police chargée + mise en page faite) et le réglage.
  useEffect(() => {
    if (!zone) return;
    let cancelled = false;
    const run = () => !cancelled && buildMask();
    const t1 = setTimeout(run, 250);
    const t2 = setTimeout(run, 1200);
    document.fonts?.ready.then(run).catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [zone, page, verses, assist, buildMask]);

  // Cadrage « Ajuster » : le bloc de texte occupe toute la largeur de l'écran.
  const fitText = useCallback(() => {
    const z0 = zoneRef.current;
    const box = boxRef.current;
    if (!z0 || !base.vw || !box) return;
    // Étendue RÉELLE des mots (le texte déborde un peu du bloc de mise en page).
    let l = z0.left, r = z0.left + z0.width, t = z0.top, b = z0.top + z0.height;
    box.querySelectorAll<HTMLElement>('.verse-word').forEach((el) => {
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== box) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      if (n !== box) return;
      l = Math.min(l, x);
      r = Math.max(r, x + el.offsetWidth);
      t = Math.min(t, y);
      b = Math.max(b, y + el.offsetHeight);
    });
    const z = Math.min(4, Math.max(0.6, (base.vw - 20) / (r - l)));
    const x = base.vw / 2 - ((l + r) / 2) * z;
    const tall = (b - t) * z > base.vh;
    const y = tall ? 10 - t * z : base.vh / 2 - ((t + b) / 2) * z;
    setView({ z, x, y });
  }, [base]);

  useEffect(() => {
    if (fittedRef.current || !zone || !base.vw) return;
    fittedRef.current = true;
    fitText();
  }, [zone, base, fitText]);

  // Changement de page.
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
      redrawInk();
    });
    return () => {
      cancelled = true;
    };
  }, [page, ready, redrawInk]);

  useEffect(() => {
    strokesRef.current = strokes;
    redrawInk();
  }, [strokes, redrawInk]);

  // Gestes du Pencil (double toucher / pression) selon Réglages › Apple Pencil.
  useEffect(() => {
    const toolSwitch = (to: TraceTool) => {
      const cur = prefsRef.current.tool;
      if (cur !== to) prevToolRef.current = cur;
      setPrefs((p) => ({ ...p, tool: to }));
    };
    const handle = (e: PencilEvent, fromSqueeze: boolean) => {
      const cur = prefsRef.current.tool;
      if (e.action === 'switchEraser') {
        if (cur === 'erase') toolSwitch(prevToolRef.current === 'erase' ? 'calame' : prevToolRef.current);
        else toolSwitch('erase');
        flash(cur === 'erase' ? 'Outil d’écriture' : 'Gomme');
      } else if (e.action === 'switchPrevious') {
        const target = prevToolRef.current === cur ? (cur === 'calame' ? 'pen' : 'calame') : prevToolRef.current;
        toolSwitch(target);
        flash(target === 'erase' ? 'Gomme' : target === 'pen' ? 'Stylo' : 'Calame');
      } else if (e.action !== 'ignore' || fromSqueeze) {
        const x = e.x ?? window.innerWidth / 2;
        const y = e.y ?? window.innerHeight / 2;
        setPalette((p) => (p ? null : { x, y }));
      }
    };
    return listenPencil(
      (e) => handle(e, false),
      (e) => handle(e, true)
    );
  }, []);
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

  // ---- Zoom et déplacement ----
  const clampZ = (z: number) => Math.min(4, Math.max(0.6, z));
  const applyStage = (v: { z: number; x: number; y: number }) => {
    viewRef.current = v;
    if (stageRef.current) stageRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  };
  const zoomBy = (f: number) => {
    const v = viewRef.current;
    const z = clampZ(v.z * f);
    const cx = base.vw / 2;
    const cy = base.vh / 2;
    setView({ z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z });
  };
  // Position dans la zone d'affichage (repère de la page, rotation annulée).
  const viewLocal = (clientX: number, clientY: number) => {
    const vp = viewportRef.current!;
    const r = vp.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const a = (-rotRef.current * Math.PI) / 180;
    return { x: dx * Math.cos(a) - dy * Math.sin(a) + vp.clientWidth / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + vp.clientHeight / 2 };
  };
  const startGesture = () => {
    const pts = [...touchesRef.current.values()];
    if (!pts.length) {
      gestureRef.current = null;
      return;
    }
    const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gestureRef.current = { ...viewRef.current, mid, dist };
  };
  // Doigts : glisser = déplacer (si « Stylet seul »), pincer = zoomer.
  const onViewDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    touchesRef.current.set(e.pointerId, viewLocal(e.clientX, e.clientY));
    const n = touchesRef.current.size;
    if (!prefsRef.current.penOnly && n === 1) return; // un doigt écrit
    if (n >= 2 && liveRef.current) {
      liveRef.current = null; // le 2e doigt annule le trait commencé au doigt
      redrawInk();
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture refusée */
    }
    startGesture();
  };
  const onViewMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !touchesRef.current.has(e.pointerId)) return;
    touchesRef.current.set(e.pointerId, viewLocal(e.clientX, e.clientY));
    const g = gestureRef.current;
    if (!g) return;
    const pts = [...touchesRef.current.values()];
    const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    const z = pts.length > 1 && g.dist > 0 ? clampZ((g.z * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / g.dist) : g.z;
    const cx = (g.mid.x - g.x) / g.z;
    const cy = (g.mid.y - g.y) / g.z;
    applyStage({ z, x: mid.x - cx * z, y: mid.y - cy * z });
  };
  const onViewUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    touchesRef.current.delete(e.pointerId);
    if (gestureRef.current) {
      if (touchesRef.current.size) startGesture();
      else {
        gestureRef.current = null;
        setView({ ...viewRef.current });
      }
    }
  };

  // ---- Saisie (coordonnées locales du canevas, rotation annulée) ----
  const local = (clientX: number, clientY: number) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const a = (-rotRef.current * Math.PI) / 180;
    const sc = (rotRef.current ? r.height : r.width) / Math.max(1, cv.clientWidth);
    return {
      x: (dx * Math.cos(a) - dy * Math.sin(a)) / sc + cv.clientWidth / 2,
      y: (dx * Math.sin(a) + dy * Math.cos(a)) / sc + cv.clientHeight / 2,
    };
  };
  const norm = (e: PointerEvent | React.PointerEvent) => {
    const cv = canvasRef.current!;
    const { x, y } = local(e.clientX, e.clientY);
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [x / cv.clientWidth, y / cv.clientHeight, pressure];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (palette) setPalette(null);
    if (e.pointerType === 'pen' && !penSeen.current) {
      penSeen.current = true;
      if (!penOnly) setPref('penOnly', true); // paume ignorée dès qu'un stylet est vu
    }
    if (penOnly && e.pointerType === 'touch') return;
    if (e.pointerType === 'touch' && (touchesRef.current.size > 0 || gestureRef.current)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y, p] = norm(e);
    const stroke: Stroke = { t: tool, c: color, w: size * SIZE_UNIT, p: [x, y, Number(p.toFixed(3))] };
    liveRef.current = { stroke, id: e.pointerId, sx: x, sy: y, sp: p, pred: [] };
    const ctx = inkCtx();
    if (ctx) drawDot(ctx, stroke, sizeRef.current.W, sizeRef.current.H);
    schedule();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    if (!live || live.id !== e.pointerId) return;
    const ne = e.nativeEvent;
    const events = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
    const { W, H } = sizeRef.current;
    const ctx = inkCtx();
    for (const ev of events.length ? events : [ne]) {
      const [x, y, p] = norm(ev);
      // Lissage léger (stabilisation) de la position et de la pression.
      // Lissage léger, nul sur les premiers points (points, petits ronds).
      const k = live.stroke.p.length / 3 < 4 ? 1 : 0.8;
      live.sx += (x - live.sx) * k;
      live.sy += (y - live.sy) * k;
      live.sp += (p - live.sp) * 0.4;
      const s = live.stroke;
      const n = s.p.length / 3;
      const lx = s.p[(n - 1) * 3], ly = s.p[(n - 1) * 3 + 1];
      if (Math.hypot((live.sx - lx) * W, (live.sy - ly) * H) < 0.35) continue;
      s.p.push(Number(live.sx.toFixed(5)), Number(live.sy.toFixed(5)), Number(live.sp.toFixed(3)));
      if (ctx) drawSeg(ctx, s, s.p.length / 3 - 1, W, H);
    }
    // Prédiction (si WebKit la fournit) : affichée, pas enregistrée.
    const predicted = typeof (ne as PointerEvent & { getPredictedEvents?: () => PointerEvent[] }).getPredictedEvents === 'function'
      ? (ne as PointerEvent & { getPredictedEvents: () => PointerEvent[] }).getPredictedEvents()
      : [];
    live.pred = predicted.flatMap((pe) => norm(pe));
    schedule();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    if (!live || live.id !== e.pointerId) return;
    // Point final réel (le lissage ne doit pas raccourcir le trait).
    const [x, y] = norm(e);
    const s = live.stroke;
    const n = s.p.length / 3;
    const { W, H } = sizeRef.current;
    if (n >= 1 && Math.hypot((x - s.p[(n - 1) * 3]) * W, (y - s.p[(n - 1) * 3 + 1]) * H) > 0.35) {
      s.p.push(Number(x.toFixed(5)), Number(y.toFixed(5)), s.p[(n - 1) * 3 + 2]);
      const ctx = inkCtx();
      if (ctx) drawSeg(ctx, s, s.p.length / 3 - 1, W, H);
    }
    live.pred = [];
    liveRef.current = null;
    schedule();
    commit([...strokesRef.current, s], { type: 'add', stroke: s });
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
  const pickTool = (t: TraceTool) => {
    if (t !== tool) prevToolRef.current = tool;
    setPref('tool', t);
  };

  const textOpacity = copyOnly ? 0 : guideMode === 'signs' ? 0 : reveal ? 1 : hideGuide ? 0 : guide;
  const letterOpacity = reveal ? 1 : hideGuide ? 0 : guide;

  const tb = (active: boolean) =>
    `h-10 min-w-10 px-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-35 ${
      active ? 'bg-[var(--ds-green)] text-white' : 'bg-white text-[var(--ds-n700)] border border-[var(--ds-divider)]'
    }`;
  const ico = (d: React.ReactNode) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
  const vline = <span className="w-px h-7 bg-[var(--ds-divider)] mx-0.5" />;

  const signLines = lines.map((l) => ({
    line: l.line,
    words: (l.words ?? [])
      .filter((w) => !w.isAyahMarker)
      .map((w) => ({ k: `${w.verseKey}:${w.position}`, t: uthmani?.[`${w.verseKey}:${w.position}`] ?? '' }))
      .filter((w) => w.t),
  }));
  const lineCount = Math.max(15, lines.length);

  const toolButtons = (
    <>
      <button className={tb(tool === 'calame')} onClick={() => pickTool('calame')} title="Calame">
        {ico(<><path d="M4 20 15 9" /><path d="m13 7 4-4 4 4-4 4" /></>)}Calame
      </button>
      <button className={tb(tool === 'pen')} onClick={() => pickTool('pen')} title="Stylo (pression)">
        {ico(<path d="M4 20h4L19 9l-4-4L4 16v4Z" />)}Stylo
      </button>
      <button className={tb(tool === 'erase')} onClick={() => pickTool('erase')} title="Gomme">
        {ico(<><path d="m7 21-4-4 11-11 7 7-7 8H7Z" /><path d="M22 21H7" /></>)}Gomme
      </button>
    </>
  );
  const colorButtons = (sz: number) =>
    COLORS.map((k) => (
      <button
        key={k.c}
        onClick={() => {
          setPref('color', k.c);
          if (tool === 'erase') pickTool(prevToolRef.current === 'erase' ? 'calame' : prevToolRef.current);
        }}
        aria-label={k.name}
        title={k.name}
        className="rounded-full flex-none"
        style={{ width: sz, height: sz, background: k.c, boxShadow: color === k.c && tool !== 'erase' ? `0 0 0 2px #fff, 0 0 0 3.5px ${k.c}` : 'none' }}
      />
    ));
  const sizeControl = (
    <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--ds-n600)]">
      Épaisseur
      <input id="ecriture-size" type="range" min={1} max={12} step={0.5} value={size} onChange={(e) => setPref('size', Number(e.target.value))} className="w-24 accent-[var(--ds-green)]" />
    </label>
  );

  if (!ready) return <div className="ds-page" />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--ds-green-deep)]">
      <div
        dir="ltr"
        className="flex flex-col overflow-hidden bg-[var(--ds-bg)] select-none"
        style={{
          fontFamily: 'var(--ds-font)',
          WebkitTouchCallout: 'none',
          ...(rot
            ? { position: 'absolute', left: '50%', top: '50%', width: '100dvh', height: '100dvw', transform: `translate(-50%, -50%) rotate(${rot}deg)` }
            : { width: '100%', height: '100%' }),
        }}
      >
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

        {/* ---- Barre du HAUT : navigation, page, outils, couleurs, épaisseur, zoom ---- */}
        {!barsHidden && (
        <div className="flex-none flex flex-wrap items-center gap-2 px-3 pt-2 pb-2 border-b border-[var(--ds-divider)]" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
          <Link href="/exercises" aria-label="Retour" className="h-10 w-10 rounded-full bg-[var(--ds-green)] text-white flex items-center justify-center flex-none">
            {ico(<path d="m15 18-6-6 6-6" />)}
          </Link>
          <div className="flex items-center gap-1">
            <button className={tb(false)} onClick={() => goPage(page + 1)} disabled={page >= 604} aria-label="Page suivante">{ico(<path d="m15 18-6-6 6-6" />)}</button>
            <input
              id="ecriture-page"
              type="text"
              inputMode="numeric"
              enterKeyHint="go"
              value={pageInput}
              placeholder={`p. ${page}`}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  submitPage();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-20 h-10 rounded-xl border-2 border-[var(--ds-gold)]/40 text-center text-[14px] font-bold outline-none focus:border-[var(--ds-gold)] placeholder:text-[var(--ds-text)]"
              aria-label="Numéro de page"
            />
            {pageInput && (
              <button onClick={submitPage} className="h-10 px-3 rounded-xl bg-[var(--ds-green)] text-white text-[12px] font-bold">Aller</button>
            )}
            <button className={tb(false)} onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="Page précédente">{ico(<path d="m9 18 6-6-6-6" />)}</button>
          </div>
          {vline}
          <div className="flex items-center gap-1">{toolButtons}</div>
          {vline}
          <div className="flex items-center gap-1.5">{colorButtons(26)}</div>
          {vline}
          {sizeControl}
          {vline}
          <div className="flex items-center gap-1">
            <button className={tb(false)} onClick={() => zoomBy(1 / 1.25)} aria-label="Dézoomer">{ico(<><circle cx="11" cy="11" r="7" /><path d="M8 11h6" /><path d="m20 20-3.5-3.5" /></>)}</button>
            <span className="text-[11px] font-bold tabular-nums text-[var(--ds-n600)] w-10 text-center">{Math.round(view.z * 100)} %</span>
            <button className={tb(false)} onClick={() => zoomBy(1.25)} aria-label="Zoomer">{ico(<><circle cx="11" cy="11" r="7" /><path d="M8 11h6" /><path d="M11 8v6" /><path d="m20 20-3.5-3.5" /></>)}</button>
            <button className={tb(false)} onClick={fitText}>Ajuster</button>
          </div>
          <button className={`${tb(false)} ml-auto`} onClick={() => setBarsHidden(true)} title="Masquer tous les réglages">
            {ico(<><path d="m18 15-6-6-6 6" /></>)}Masquer réglages
          </button>
        </div>
        )}

        {/* ---- Page + zone d'écriture ---- */}
        <div
          ref={viewportRef}
          className="flex-1 min-h-0 relative overflow-hidden bg-[var(--ds-green-deep)]"
          style={{ touchAction: 'none' }}
          onPointerDown={onViewDown}
          onPointerMove={onViewMove}
          onPointerUp={onViewUp}
          onPointerCancel={onViewUp}
        >
          <div
            ref={stageRef}
            className="absolute left-0 top-0"
            style={{ width: base.w, height: base.h, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
          >
          <div ref={boxRef} className="trace-guide relative w-full h-full" style={{ ['--guide' as string]: String(textOpacity) }}>
            <MushafPage pageNumber={page} pageVerses={verses} loading={!verses} />
            {zone && (
              <>
                {guideMode === 'signs' && !copyOnly && (
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
                  </div>
                )}
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
                />
              </>
            )}
          </div>
          </div>
          {/* Réglages masqués : rappel discret + zoom */}
          {barsHidden && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-white/90 backdrop-blur rounded-full shadow-lg px-1.5 py-1" style={{ marginTop: 'env(safe-area-inset-top)' }}>
              <button className="h-9 px-3 rounded-full text-[12px] font-bold text-[var(--ds-green)]" onClick={() => setBarsHidden(false)}>Réglages</button>
              <button
                className={`h-9 px-3 rounded-full text-[12px] font-bold ${copyOnly ? 'bg-[var(--ds-green)] text-white' : 'text-[var(--ds-green)]'}`}
                onClick={() => setCopyOnly((v) => !v)}
              >
                {copyOnly ? 'Ma copie' : 'Modèle'}
              </button>
              <button className="h-9 w-9 rounded-full text-[var(--ds-green)] text-lg font-bold" onClick={() => zoomBy(1 / 1.25)} aria-label="Dézoomer">−</button>
              <button className="h-9 w-9 rounded-full text-[var(--ds-green)] text-lg font-bold" onClick={() => zoomBy(1.25)} aria-label="Zoomer">+</button>
              <button className="h-9 px-3 rounded-full text-[12px] font-bold text-[var(--ds-green)]" onClick={fitText}>Ajuster</button>
            </div>
          )}
          {toast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full bg-[var(--ds-green)] text-white text-[13px] font-bold shadow-lg pointer-events-none">{toast}</div>
          )}
        </div>

        {/* ---- Barre du BAS : historique, modèle, guidage, stylet seul ---- */}
        {!barsHidden && (
        <div className="flex-none flex flex-wrap items-center gap-2 px-3 pt-2 border-t border-[var(--ds-divider)]" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <button className={tb(false)} onClick={undo} disabled={!undoStack.length} title="Annuler">{ico(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>)}</button>
          <button className={tb(false)} onClick={redo} disabled={!redoStack.length} title="Rétablir">{ico(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>)}</button>
          {!confirmClear ? (
            <button className={tb(false)} onClick={() => setConfirmClear(true)} disabled={!strokes.length}>{ico(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>)}Effacer</button>
          ) : (
            <span className="flex gap-1">
              <button className="h-10 px-3 rounded-xl text-[12px] font-bold bg-red-600 text-white" onClick={clearPage}>Effacer la page</button>
              <button className={tb(false)} onClick={() => setConfirmClear(false)}>Non</button>
            </span>
          )}
          {vline}
          <button className={tb(copyOnly)} onClick={() => setCopyOnly((v) => !v)} title="Retirer le modèle pour relire ton écriture">
            {ico(<><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></>)}{copyOnly ? 'Ma copie' : 'Modèle'}
          </button>
          <button className={tb(guideMode === 'text')} onClick={() => setPref('guideMode', 'text')}>Texte</button>
          <button className={tb(guideMode === 'signs')} onClick={() => setPref('guideMode', 'signs')}>Signes</button>
          <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--ds-n600)]">
            {guideMode === 'signs' ? 'Lettres' : 'Contraste'}
            <input id="ecriture-guide" type="range" min={guideMode === 'signs' ? 0 : 0.03} max={0.6} step={0.01} value={guide} onChange={(e) => setPref('guide', Number(e.target.value))} className="w-24 accent-[var(--ds-gold)]" />
          </label>
          <button className={tb(hideGuide)} onClick={() => setHideGuide((v) => !v)}>{hideGuide ? 'Masqué' : 'Masquer'}</button>
          <button
            className={tb(reveal)}
            onPointerDown={() => setReveal(true)}
            onPointerUp={() => setReveal(false)}
            onPointerLeave={() => setReveal(false)}
            onPointerCancel={() => setReveal(false)}
          >
            Révéler
          </button>
          {vline}
          <span className="text-[11px] font-bold text-[var(--ds-n600)]">Guidage</span>
          {(['off', 'light', 'strong'] as Assist[]).map((a) => (
            <button key={a} className={tb(assist === a)} onClick={() => setPref('assist', a)}>
              {a === 'off' ? 'Off' : ASSIST[a].label}
            </button>
          ))}
          {vline}
          <button className={tb(penOnly)} onClick={() => setPref('penOnly', !penOnly)} title="Ignorer les doigts et la paume (les doigts déplacent la page)">Stylet seul</button>
        </div>
        )}

        {/* ---- Palette rapide : double toucher / pression du Pencil ---- */}
        {palette && (
          <div className="absolute inset-0 z-50" onPointerDown={() => setPalette(null)}>
            <div
              className="absolute bg-white rounded-2xl shadow-2xl border border-[var(--ds-divider)] p-3 flex flex-col gap-2.5"
              style={{ left: Math.min(Math.max(palette.x, 170), window.innerWidth - 170), top: Math.min(Math.max(palette.y - 140, 80), window.innerHeight - 260), transform: 'translateX(-50%)' }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex gap-1">{toolButtons}</div>
              <div className="flex gap-2 justify-center">{colorButtons(30)}</div>
              {sizeControl}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
