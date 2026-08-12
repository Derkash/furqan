'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PageVerses } from '@/types';
import BlurOverlay from './BlurOverlay';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import { loadHizbQuarters, type HizbQuarter } from '@/utils/quranBounds';

export interface FrameConfig {
  outerInsetH: number; // % from left/right of page where outer gold line sits
  outerInsetV: number; // % from top/bottom
  bandWidth: number; // % of page width that the decorative band occupies (between outer and inner gold lines)
  textInsetH: number; // % from left/right where text content starts
  textInsetTop: number; // % from top
  textInsetBottom: number; // % from bottom
  textFontSize: number; // cqi (% of container width) for verse text
  pageNumberSize: number; // cqi for page number font size
  pageNumberBottom: number; // % from bottom for page number position
  showPattern: boolean;
  topGap: number; // px between the top of the wrapper and the top of the page
}

export const DEFAULT_FRAME: FrameConfig = {
  outerInsetH: 2.1,
  outerInsetV: 5.3,
  bandWidth: 1.2,
  textInsetH: 8.2,
  textInsetTop: 8.6,
  textInsetBottom: 9,
  textFontSize: 5.15,
  pageNumberSize: 3.2,
  pageNumberBottom: 2.1,
  showPattern: true,
  topGap: 0,
};

// ---- Cadre AUTHENTIQUE du Mushaf Medina Old (1405H) ----
// Les fonds public/mushaf-frame/frame-{odd,even}.png sont extraits des scans
// (759×1100) du vrai mushaf : l'ornement est décalé vers la reliure, donc les
// marges sont asymétriques et MIROIR entre page impaire (droite du spread,
// reliure à gauche) et page paire (gauche du spread, reliure à droite).
// Les insets ci-dessous = boîte intérieure du liseré or, mesurée sur les scans.
const AUTHENTIC_INSETS = {
  odd: { top: 13.1, bottom: 10.7, left: 8.4, right: 18.2 },
  even: { top: 12.2, bottom: 11.7, left: 17.5, right: 9.2 },
} as const;

// Libellés rédigés par l'app (badge sourate en haut, numéro dans le médaillon
// de hizb, nom de sourate dans le cartouche). Désactivés à la demande de
// l'utilisateur — NB : les fonds extraits des scans ont été nettoyés de ces
// textes (ils étaient propres à une page précise), donc rien n'est « écrit en
// dur » dans le cadre. Repasser à true pour réafficher les libellés de l'app.
const SHOW_MARGIN_LABELS = false;

/** Libellé du médaillon pour le quart q (1-240), comme dans le mushaf imprimé. */
function quarterLabel(q: number): { title: string; hizb: number } {
  const hizb = Math.floor((q - 1) / 4) + 1;
  const pos = (q - 1) % 4;
  const title = ['الحزب', 'ربع الحزب', 'نصف الحزب', 'ثلاثة أرباع الحزب'][pos];
  return { title, hizb };
}

interface MushafPageProps {
  pageNumber: number;
  pageVerses?: PageVerses | null;
  revealedVerses?: Set<string>;
  visibleVerses?: Set<string>;
  highlightedVerseKey?: string;
  /** Versets à surligner en jaune (en plus de highlightedVerseKey). */
  extraHighlightVerseKeys?: Set<string>;
  isBlurred?: boolean;
  maskAll?: boolean;
  loading?: boolean;
  /**
   * Marques par mot, clés "verseKey#position" → 'selected' (sélection en cours)
   * ou type de faute ('oubli' | 'inversion' | 'harakat' | 'mot'), chacun sa couleur.
   */
  wordMarks?: Map<string, string>;
  /**
   * Marqueurs de fin de verset (numéros) à entourer en rouge, par verseKey.
   * Utilisé en mode Lecture pour cercler le numéro du verset précédant le
   * verset du milieu de chaque page.
   */
  circledMarkerVerseKeys?: Set<string>;
  /**
   * Thèmes de tafsir : verseKey → numéro de groupe. Les versets d'un même
   * groupe (même tafsir Ibn Kathir) partagent la même teinte (opacité 20 %),
   * alternée entre groupes voisins.
   */
  verseThemes?: Record<string, number> | null;
  frameConfig?: Partial<FrameConfig>;
  /**
   * Niveau de Hifz (0-8). 0 = tout visible, 8 = quasi rien.
   * Lorsque défini, override le masquage par verset (maskAll est ignoré pour les mots non-marker).
   */
  hifzLevel?: number;
  /**
   * Fraction du verset révélée en sixièmes (1-6) pour les versets visibles :
   * seuls les premiers ⌈k/6 × longueur⌉ mots sont montrés. Absent ou 6 = complet.
   */
  revealFraction?: number;
}

/**
 * Hash déterministe pour décider si un mot doit être caché à un niveau de Hifz donné.
 * Retourne un nombre dans [0, 1[.
 */
function wordHash(pageNumber: number, verseKey: string, position: number): number {
  let h = pageNumber * 2654435761;
  const key = `${verseKey}#${position}`;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  // Convertir en [0, 1[
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Répartit `total` unités sur `slots` cases, en étalant les "+1" de façon régulière
 * (pas en bloc) à partir d'un décalage `offset` déterministe.
 */
function distributeSpread(total: number, slots: number, offset: number): number[] {
  const base = Math.floor(total / slots);
  const r = total - base * slots;
  const arr = new Array(slots).fill(base);
  for (let k = 0; k < r; k++) {
    const idx = Math.floor(((k + 0.5) * slots) / r);
    arr[(idx + offset) % slots] += 1;
  }
  return arr;
}

/**
 * Choisit `count` indices parmi [0, length-1] en espaçant les mots masqués :
 *   - tant que count ≤ ⌈length/2⌉ : AUCUN mot masqué n'est adjacent (≥ 1 mot visible
 *     entre deux mots masqués), les masques étant répartis régulièrement ;
 *   - au-delà (≈ > moitié) : la contrainte se relâche progressivement, les rares mots
 *     visibles restant servant de séparateurs régulièrement espacés ;
 *   - count = length : tout est masqué (niveau max).
 * Déterministe (via `offset`) → stable sur une page, pas de scintillement.
 */
function chooseSpacedIndices(length: number, count: number, offset: number): number[] {
  if (count <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, i) => i);

  const visible = length - count;
  const gaps = new Array(count + 1).fill(0); // espaces visibles avant/entre/après les masques

  if (visible >= count - 1) {
    // Non-adjacence possible : 1 visible entre chaque paire, le reste réparti régulièrement.
    for (let k = 1; k <= count - 1; k++) gaps[k] = 1;
    const extra = visible - (count - 1);
    const spread = distributeSpread(extra, count + 1, offset);
    for (let k = 0; k <= count; k++) gaps[k] += spread[k];
  } else {
    // Non-adjacence impossible : on étale les `visible` séparateurs uniques entre les masques.
    for (let j = 0; j < visible; j++) {
      const idx = Math.floor(((j + 0.5) * (count - 1)) / visible);
      gaps[1 + idx] = 1;
    }
  }

  const indices: number[] = [];
  let pos = 0;
  for (let i = 0; i < count; i++) {
    pos += gaps[i];
    indices.push(pos);
    pos += 1;
  }
  return indices;
}

interface WordData {
  verseKey: string;
  code: string;
  position: number;
  isAyahMarker: boolean;
}

type LineType = 'content' | 'announcement' | 'basmala' | 'empty';

interface LineData {
  line: number;
  type: LineType;
  words?: WordData[];
  surah?: number;
  nameArabic?: string;
}

interface PageData {
  page: number;
  font: string;
  verses: string[];
  lines: LineData[];
}

const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

// Chapitres (nom + plage de pages par sourate) : chargés une seule fois,
// partagés entre toutes les pages — sert au badge « page N/M de la sourate ».
interface ChapterInfo {
  id: number;
  name_simple: string;
  name_arabic: string;
  pages: [number, number];
}
let chaptersCache: ChapterInfo[] | null = null;
let chaptersPromise: Promise<ChapterInfo[]> | null = null;

function loadChapters(): Promise<ChapterInfo[]> {
  if (chaptersCache) return Promise.resolve(chaptersCache);
  if (!chaptersPromise) {
    chaptersPromise = fetch('/qcf-data/chapters.json')
      .then((r) => r.json())
      .then((list: ChapterInfo[]) => {
        chaptersCache = list;
        return list;
      })
      .catch(() => []);
  }
  return chaptersPromise;
}

const loadedFonts = new Set<string>();

function ensureFontLoaded(fontFamily: string) {
  if (typeof document === 'undefined') return;
  if (loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-qcf-font', fontFamily);
  styleEl.textContent = `@font-face { font-family: '${fontFamily}'; src: url('/fonts/qcf-v2/${fontFamily}.woff2') format('woff2'); font-display: block; }`;
  document.head.appendChild(styleEl);
}

export default function MushafPage({
  pageNumber,
  visibleVerses = new Set(),
  highlightedVerseKey,
  extraHighlightVerseKeys,
  isBlurred = false,
  maskAll = false,
  loading = false,
  wordMarks,
  circledMarkerVerseKeys,
  verseThemes,
  frameConfig,
  hifzLevel,
  revealFraction,
}: MushafPageProps) {
  const config: FrameConfig = { ...DEFAULT_FRAME, ...(frameConfig ?? {}) };
  const [data, setData] = useState<PageData | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[] | null>(chaptersCache);
  const [quarters, setQuarters] = useState<HizbQuarter[] | null>(null);
  const padded = String(pageNumber).padStart(3, '0');
  const fontFamily = `QCF_P${padded}`;

  useEffect(() => {
    let cancelled = false;
    loadChapters().then((list) => {
      if (!cancelled) setChapters(list);
    });
    loadHizbQuarters().then((list) => {
      if (!cancelled) setQuarters(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Médaillons de hizb en marge : quart dont le verset COMMENCE sur cette page
  // (position 1 du verset présente), positionné à la ligne de ce premier mot.
  const pageQuarterMarks = useMemo(() => {
    if (!data || !quarters) return [];
    const marks: { line: number; title: string; hizb: number }[] = [];
    for (const quarter of quarters) {
      const verseKey = `${quarter.surah}:${quarter.ayah}`;
      for (const line of data.lines) {
        if (line.type !== 'content' || !line.words) continue;
        if (line.words.some((w) => w.verseKey === verseKey && !w.isAyahMarker && w.position === 1)) {
          marks.push({ line: line.line, ...quarterLabel(quarter.q) });
          break;
        }
      }
    }
    return marks;
  }, [data, quarters]);

  // Badge « numéro de page dans la sourate » : sourate du premier verset de la
  // page, position = page − première page de la sourate + 1 (sur total).
  const surahPageLabel = useMemo(() => {
    if (!data || !chapters) return null;
    let firstVerseKey: string | null = null;
    for (const line of data.lines) {
      if (line.type !== 'content' || !line.words) continue;
      const word = line.words.find((w) => !w.isAyahMarker);
      if (word) {
        firstVerseKey = word.verseKey;
        break;
      }
    }
    if (!firstVerseKey) return null;
    const surah = Number(firstVerseKey.split(':')[0]);
    const chapter = chapters.find((c) => c.id === surah);
    if (!chapter) return null;
    const n = pageNumber - chapter.pages[0] + 1;
    const total = chapter.pages[1] - chapter.pages[0] + 1;
    if (n < 1 || n > total) return null;
    return `${chapter.name_simple} · ${n}/${total}`;
  }, [data, chapters, pageNumber]);

  /**
   * Calcule, pour chaque verset, les positions de mots à masquer au niveau Hifz courant.
   *
   * Règle :
   *   - Niveau N → masque MAX(N, ⌊N/8 × (longueur-1)⌋) mots par verset
   *   - Au moins 1 mot reste visible par verset
   *   - Sélection déterministe : les mots avec le plus petit hash sont masqués en premier
   *
   * Conséquence : sur une page avec un seul long verset, le niveau 1 masque déjà
   * beaucoup de mots (proportionnellement à la longueur). Sur une page avec des
   * versets courts, ~N mots par verset.
   */
  const hifzHidden = useMemo(() => {
    if (!data || !hifzLevel || hifzLevel <= 0) return null;
    const versePositions = new Map<string, number[]>();
    for (const line of data.lines) {
      if (line.type !== 'content' || !line.words) continue;
      for (const w of line.words) {
        if (w.isAyahMarker) continue;
        if (!versePositions.has(w.verseKey)) versePositions.set(w.verseKey, []);
        versePositions.get(w.verseKey)!.push(w.position);
      }
    }
    const result = new Map<string, Set<number>>();
    for (const [verseKey, positions] of versePositions) {
      const length = positions.length;
      if (length === 0) {
        result.set(verseKey, new Set());
        continue;
      }
      const linearCount = hifzLevel; // N mots par verset
      const proportionalCount = Math.floor((hifzLevel / 8) * (length - 1));
      const count = Math.min(length - 1, Math.max(linearCount, proportionalCount));
      if (count <= 0) {
        result.set(verseKey, new Set());
        continue;
      }
      // Mots du verset dans l'ordre de lecture ; on masque des indices ESPACÉS
      // pour éviter les blocs de mots adjacents (cf. chooseSpacedIndices).
      const ordered = positions.slice().sort((a, b) => a - b);
      const offset = Math.floor(wordHash(pageNumber, verseKey, 0) * 1000);
      const indices = chooseSpacedIndices(ordered.length, count, offset);
      result.set(verseKey, new Set(indices.map((i) => ordered[i])));
    }
    return result;
  }, [data, hifzLevel, pageNumber]);

  // Révélation partielle : position max à montrer par verset (⌈k/6 × longueur⌉).
  // Les positions de mots sont globales au verset, donc le calcul reste correct
  // même si le verset déborde sur la page voisine.
  const fractionCutoff = useMemo(() => {
    if (!data || !revealFraction || revealFraction <= 0 || revealFraction >= 6) return null;
    const maxPos = new Map<string, number>();
    for (const line of data.lines) {
      if (line.type !== 'content' || !line.words) continue;
      for (const w of line.words) {
        if (w.isAyahMarker) continue;
        if ((maxPos.get(w.verseKey) ?? 0) < w.position) maxPos.set(w.verseKey, w.position);
      }
    }
    const cutoff = new Map<string, number>();
    for (const [verseKey, len] of maxPos) {
      cutoff.set(verseKey, Math.max(1, Math.ceil((revealFraction / 6) * len)));
    }
    return cutoff;
  }, [data, revealFraction]);

  useEffect(() => {
    ensureFontLoaded(fontFamily);
    let cancelled = false;
    setData(null);
    fetch(`/qcf-data/page-${padded}.json`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageNumber, padded, fontFamily]);

  // Page paire (left side of spread) sticks to its right edge (the gutter)
  // Page impaire (right side of spread) sticks to its left edge (the gutter)
  // → pages adjacentes, pas d'espace vide entre elles
  const isOddPage = pageNumber % 2 === 1;
  const wrapperJustify = isOddPage ? 'flex-start' : 'flex-end';
  const ins = isOddPage ? AUTHENTIC_INSETS.odd : AUTHENTIC_INSETS.even;

  return (
    <div
      className="mushaf-page-wrapper"
      style={{ justifyContent: wrapperJustify, paddingTop: `${config.topGap}px` }}
    >
      <style>{`
        .mushaf-page-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: flex-start;
          box-sizing: border-box;
          container-type: size;
        }
        .mushaf-page {
          position: relative;
          aspect-ratio: 759 / 1100;
          /* Fit-contain : la page prend la plus grande taille possible dans le wrapper
             tout en gardant l'aspect-ratio. Indispensable pour que 2 pages côte à côte
             rentrent toujours dans l'écran, même en portrait étroit. */
          width: min(100cqi, calc(100cqb * 759 / 1100));
          height: min(100cqb, calc(100cqi * 1100 / 759));
          background: rgb(251, 247, 223); /* papier des scans du Mushaf */
          color: #1a1a1a;
          box-sizing: border-box;
          container-type: inline-size;
          overflow: hidden;
        }
        .mushaf-line {
          line-height: 1;
          direction: rtl;
          color: #1a1a1a;
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          justify-content: space-between;
          align-items: baseline;
        }
        .mushaf-line.empty { visibility: hidden; }
        .mushaf-authentic-row {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .verse-word {
          transition: color 0.25s ease, background-color 0.25s ease;
          display: inline-block;
          color: #1a1a1a;
          /* Crucial : certains "mots" QCF V1 contiennent 2 glyphes séparés par un espace
             (ex. Rub al-Hizb + mot suivant). Sans nowrap, le span peut wrapper en interne
             quand le flex serre les items, et la 2e partie tombe à la ligne suivante. */
          white-space: nowrap;
        }
        .verse-word.hidden {
          color: transparent;
        }
        .verse-word.ayah-marker {
          color: #2d5016;
        }
        /* Numéro de verset entouré en rouge (verset précédant le verset du
           milieu de la page). Anneau peint en box-shadow → n'altère pas la
           largeur du mot, donc pas de débordement de la ligne justifiée. */
        .verse-word.ayah-marker-circled {
          color: #c62828;
          box-shadow: 0 0 0 2px #d32f2f;
          border-radius: 50%;
        }
        .verse-word.highlighted {
          /* Halo peint en box-shadow : ne modifie PAS la largeur des mots,
             sinon les lignes justifiées débordent du cadre de la page. */
          background-color: rgba(255, 215, 0, 0.35);
          box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.35);
          border-radius: 6px;
        }
        /* Thèmes de tafsir : versets d'un même groupe = même teinte, palette
           pastel bien différenciée (façon Mushaf thématique imprimé : saumon,
           bleu ciel, vert d'eau, sable) en rotation entre groupes voisins.
           Déclarés AVANT les marques de fautes pour que celles-ci l'emportent. */
        .verse-word.theme-0 {
          background-color: rgba(233, 140, 110, 0.32);
        }
        .verse-word.theme-1 {
          background-color: rgba(110, 165, 220, 0.32);
        }
        .verse-word.theme-2 {
          background-color: rgba(125, 195, 125, 0.34);
        }
        .verse-word.theme-3 {
          background-color: rgba(228, 195, 100, 0.36);
        }

        /* Marques de fautes — même technique box-shadow (pas de padding),
           une couleur par type. */
        .verse-word.mark-selected {
          background-color: rgba(100, 116, 139, 0.22);
          box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.35);
          border-radius: 6px;
        }
        .verse-word.mark-oubli {
          background-color: rgba(217, 119, 6, 0.22);
          box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.32);
          border-radius: 6px;
        }
        .verse-word.mark-inversion {
          background-color: rgba(124, 58, 237, 0.20);
          box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.30);
          border-radius: 6px;
        }
        .verse-word.mark-harakat {
          background-color: rgba(37, 99, 235, 0.18);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.30);
          border-radius: 6px;
        }
        .verse-word.mark-mot {
          background-color: rgba(220, 38, 38, 0.22);
          box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.30);
          border-radius: 6px;
        }
        /* Mots du lexique personnel (mode Lecture) — vert olive. */
        .verse-word.mark-lexicon {
          background-color: rgba(74, 124, 35, 0.20);
          box-shadow: 0 0 0 2px rgba(74, 124, 35, 0.32);
          border-radius: 6px;
        }
        .mushaf-loader {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(253, 250, 243, 0.6);
          z-index: 30;
        }
        .mushaf-loader-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #2d5016;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="mushaf-page">
        {/* Cadre authentique extrait des scans du Mushaf Medina Old */}
        <img
          src={`/mushaf-frame/frame-${isOddPage ? 'odd' : 'even'}.png`}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
            userSelect: 'none',
          }}
          aria-hidden
        />

        {/* Médaillons de hizb dans la marge extérieure, au niveau du verset */}
        {pageQuarterMarks.map((mark) => {
          const lineCenter = ins.top + ((mark.line - 0.5) / 15) * (100 - ins.top - ins.bottom);
          return (
            <div
              key={`hizb-${mark.line}`}
              style={{
                position: 'absolute',
                top: `${lineCenter - 11.8}%`,
                height: '23.6%',
                width: '9.6%',
                ...(isOddPage ? { right: '0.2%' } : { left: '0.2%' }),
                zIndex: 1,
                pointerEvents: 'none',
              }}
              aria-hidden
            >
              <img
                src="/mushaf-frame/medallion.png"
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', userSelect: 'none' }}
              />
              {SHOW_MARGIN_LABELS && (
                <div
                  style={{
                    position: 'absolute',
                    top: '38%',
                    bottom: '38%',
                    left: '18%',
                    right: '18%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    direction: 'rtl',
                    textAlign: 'center',
                    fontFamily: "'Amiri', 'Scheherazade New', serif",
                    color: '#6b4f1d',
                    fontWeight: 700,
                    fontSize: mark.title.length > 10 ? '0.95cqi' : '1.25cqi',
                    lineHeight: 1.15,
                  }}
                >
                  <span>{mark.title}</span>
                  <span>{toArabicNumbers(mark.hizb)}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Numéro de page relatif à la sourate : en haut à DROITE pour la page
            de droite (impaire), en haut à GAUCHE pour la page de gauche (paire) */}
        {SHOW_MARGIN_LABELS && surahPageLabel && (
          <div
            style={{
              position: 'absolute',
              top: '1.2%',
              ...(isOddPage ? { right: '2.8%' } : { left: '2.8%' }),
              fontSize: '2.1cqi',
              fontWeight: 700,
              color: '#7a5d2c',
              letterSpacing: '0.03em',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          >
            {surahPageLabel}
          </div>
        )}

        <div
          className="mushaf-content"
          style={{
            position: 'absolute',
            top: `${ins.top}%`,
            right: `${ins.right}%`,
            bottom: `${ins.bottom}%`,
            left: `${ins.left}%`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            zIndex: 2,
          }}
        >
          {data
            ? data.lines.map((line) => {
                if (line.type === 'empty') {
                  return <div key={line.line} className="mushaf-line empty" />;
                }
                if (line.type === 'announcement') {
                  // Cartouche authentique (scan) : ornements aux extrémités,
                  // nom de la sourate calligraphié par-dessus le centre vidé.
                  return (
                    <div key={line.line} className="mushaf-authentic-row">
                      <div style={{ position: 'relative', width: '100%' }}>
                        <img
                          src="/mushaf-frame/cartouche.png"
                          alt=""
                          draggable={false}
                          style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
                          aria-hidden
                        />
                        {SHOW_MARGIN_LABELS && (
                          <span
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              direction: 'rtl',
                              fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif",
                              fontSize: '3.1cqi',
                              fontWeight: 700,
                              color: '#4a3410',
                              paddingBottom: '0.5cqi',
                            }}
                          >
                            سُورَةُ {line.nameArabic}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                if (line.type === 'basmala') {
                  // Basmallah calligraphiée authentique (extraite du scan).
                  return (
                    <div key={line.line} className="mushaf-authentic-row">
                      <img
                        src="/mushaf-frame/basmallah.png"
                        alt={BASMALA_TEXT}
                        draggable={false}
                        style={{ width: '57%', height: 'auto', userSelect: 'none' }}
                      />
                    </div>
                  );
                }
                // content
                return (
                  <div
                    key={line.line}
                    className="mushaf-line"
                    style={{ fontFamily: `'${fontFamily}', serif`, fontSize: `${config.textFontSize}cqi` }}
                  >
                    {(line.words ?? []).map((w, i) => {
                      const verseMaskHide = maskAll && !visibleVerses.has(w.verseKey) && !w.isAyahMarker;
                      // Révélation partielle : au-delà de la fraction choisie, le mot reste masqué.
                      const fractionHide =
                        !verseMaskHide &&
                        maskAll &&
                        !w.isAyahMarker &&
                        fractionCutoff !== null &&
                        visibleVerses.has(w.verseKey) &&
                        w.position > (fractionCutoff.get(w.verseKey) ?? Infinity);
                      const hifzHide =
                        hifzHidden && !w.isAyahMarker
                          ? hifzHidden.get(w.verseKey)?.has(w.position) ?? false
                          : false;
                      const shouldHide = verseMaskHide || hifzHide || fractionHide;
                      const isHighlighted =
                        (highlightedVerseKey === w.verseKey ||
                          (extraHighlightVerseKeys?.has(w.verseKey) ?? false)) &&
                        visibleVerses.has(w.verseKey);
                      const mark = w.isAyahMarker
                        ? undefined
                        : wordMarks?.get(`${w.verseKey}#${w.position}`);
                      const themeGroup = verseThemes?.[w.verseKey];
                      const classes = ['verse-word'];
                      if (themeGroup !== undefined) {
                        classes.push(`theme-${themeGroup % 4}`);
                      }
                      if (shouldHide) classes.push('hidden');
                      if (isHighlighted && !mark) classes.push('highlighted');
                      if (mark) classes.push(`mark-${mark}`);
                      if (w.isAyahMarker) classes.push('ayah-marker');
                      if (w.isAyahMarker && circledMarkerVerseKeys?.has(w.verseKey))
                        classes.push('ayah-marker-circled');
                      return (
                        <span
                          key={`${line.line}-${i}`}
                          className={classes.join(' ')}
                          data-verse={w.verseKey}
                          data-pos={w.position}
                          data-page={pageNumber}
                        >
                          {w.code}
                        </span>
                      );
                    })}
                  </div>
                );
              })
            : null}
        </div>

        <div
          className="mushaf-page-number"
          style={{
            position: 'absolute',
            bottom: `${config.pageNumberBottom}%`,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: "'Amiri', 'Scheherazade New', serif",
            fontSize: `${config.pageNumberSize}cqi`,
            fontWeight: 600,
            color: '#1a1a1a',
            letterSpacing: '0.05em',
            zIndex: 2,
          }}
        >
          {toArabicNumbers(pageNumber)}
        </div>

        <BlurOverlay isActive={isBlurred} />

        {(loading || !data) && (
          <div className="mushaf-loader">
            <div className="mushaf-loader-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
