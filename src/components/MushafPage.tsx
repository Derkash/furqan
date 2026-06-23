'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PageVerses } from '@/types';
import BlurOverlay from './BlurOverlay';
import { toArabicNumbers } from '@/utils/arabicNumbers';

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
  textFontSize: 6,
  pageNumberSize: 3.2,
  pageNumberBottom: 2.1,
  showPattern: true,
  topGap: 0,
};

interface MushafPageProps {
  pageNumber: number;
  pageVerses?: PageVerses | null;
  revealedVerses?: Set<string>;
  visibleVerses?: Set<string>;
  highlightedVerseKey?: string;
  isBlurred?: boolean;
  maskAll?: boolean;
  loading?: boolean;
  frameConfig?: Partial<FrameConfig>;
  /**
   * Niveau de Hifz (0-8). 0 = tout visible, 8 = quasi rien.
   * Lorsque défini, override le masquage par verset (maskAll est ignoré pour les mots non-marker).
   */
  hifzLevel?: number;
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

const PAGE_VB_W = 759;
const PAGE_VB_H = 1100;

function MushafFrame({ config }: { config: FrameConfig }) {
  const outerX = (config.outerInsetH / 100) * PAGE_VB_W;
  const outerY = (config.outerInsetV / 100) * PAGE_VB_H;
  const outerW = PAGE_VB_W - 2 * outerX;
  const outerH = PAGE_VB_H - 2 * outerY;

  const bandPxH = (config.bandWidth / 100) * PAGE_VB_W;
  const bandPxV = (config.bandWidth / 100) * PAGE_VB_W; // use width-based for uniformity

  const innerX = outerX + bandPxH;
  const innerY = outerY + bandPxV;
  const innerW = outerW - 2 * bandPxH;
  const innerH = outerH - 2 * bandPxV;

  return (
    <svg
      viewBox={`0 0 ${PAGE_VB_W} ${PAGE_VB_H}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden
    >
      <defs>
        <pattern
          id="mushaf-diamonds"
          x="0"
          y="0"
          width="34"
          height="34"
          patternUnits="userSpaceOnUse"
        >
          <rect width="34" height="34" fill="#2d5016" />
          <path
            d="M17 4 L30 17 L17 30 L4 17 Z"
            fill="#c9a959"
            stroke="#2d5016"
            strokeWidth="0.5"
          />
          <path d="M17 10 L24 17 L17 24 L10 17 Z" fill="#2d5016" />
          <circle cx="17" cy="17" r="1.5" fill="#c9a959" />
        </pattern>
        <mask id="mushaf-frame-ring">
          <rect x={outerX} y={outerY} width={outerW} height={outerH} fill="white" />
          <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="black" />
        </mask>
      </defs>

      {/* Decorative band */}
      <rect
        x={outerX}
        y={outerY}
        width={outerW}
        height={outerH}
        fill={config.showPattern ? 'url(#mushaf-diamonds)' : '#2d5016'}
        mask="url(#mushaf-frame-ring)"
      />

      {/* Outer gold line */}
      <rect
        x={outerX}
        y={outerY}
        width={outerW}
        height={outerH}
        fill="none"
        stroke="#b8860b"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {/* Inner gold line */}
      <rect
        x={innerX}
        y={innerY}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="#b8860b"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function MushafPage({
  pageNumber,
  visibleVerses = new Set(),
  highlightedVerseKey,
  isBlurred = false,
  maskAll = false,
  loading = false,
  frameConfig,
  hifzLevel,
}: MushafPageProps) {
  const config: FrameConfig = { ...DEFAULT_FRAME, ...(frameConfig ?? {}) };
  const [data, setData] = useState<PageData | null>(null);
  const padded = String(pageNumber).padStart(3, '0');
  const fontFamily = `QCF_P${padded}`;

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
          background: #fdfaf3;
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
        .mushaf-cartouche-row {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 2%;
          gap: 4%;
        }
        .mushaf-cartouche-row .endcap {
          width: 4cqi;
          height: 4cqi;
          flex-shrink: 0;
          color: #b8860b;
        }
        .mushaf-cartouche {
          position: relative;
          flex: 1;
          max-width: 75%;
          padding: 0.35em 1.8em;
          border-radius: 6px;
          text-align: center;
          font-family: 'Amiri', 'Scheherazade New', 'Traditional Arabic', serif;
          color: #2d5016;
          background:
            repeating-linear-gradient(
              45deg,
              transparent 0 4px,
              rgba(184, 134, 11, 0.25) 4px 5px
            ),
            #fdfaf3;
          box-shadow:
            inset 0 0 0 2px #b8860b,
            inset 0 0 0 3px #fdfaf3,
            inset 0 0 0 4.5px #b8860b,
            0 0 0 0.5px rgba(0,0,0,0.05);
          letter-spacing: 0.02em;
          direction: rtl;
        }
        .mushaf-cartouche.announcement {
          font-size: 3.6cqi;
          font-weight: 700;
        }
        .mushaf-cartouche.basmala {
          font-size: 3.4cqi;
          font-weight: 600;
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
        .verse-word.highlighted {
          background-color: rgba(255, 215, 0, 0.35);
          border-radius: 6px;
          padding: 0 2px;
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
        <MushafFrame config={config} />

        <div
          className="mushaf-content"
          style={{
            position: 'absolute',
            top: `${config.textInsetTop}%`,
            right: `${config.textInsetH}%`,
            bottom: `${config.textInsetBottom}%`,
            left: `${config.textInsetH}%`,
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
                  return (
                    <div key={line.line} className="mushaf-cartouche-row">
                      <svg className="endcap" viewBox="0 0 20 20" aria-hidden>
                        <polygon points="10,2 14,10 10,18 6,10" fill="currentColor" opacity="0.8" />
                        <circle cx="10" cy="10" r="2" fill="#fdfaf3" />
                      </svg>
                      <div className="mushaf-cartouche announcement">
                        سُورَةُ {line.nameArabic}
                      </div>
                      <svg className="endcap" viewBox="0 0 20 20" aria-hidden>
                        <polygon points="10,2 14,10 10,18 6,10" fill="currentColor" opacity="0.8" />
                        <circle cx="10" cy="10" r="2" fill="#fdfaf3" />
                      </svg>
                    </div>
                  );
                }
                if (line.type === 'basmala') {
                  return (
                    <div key={line.line} className="mushaf-cartouche-row">
                      <svg className="endcap" viewBox="0 0 20 20" aria-hidden>
                        <polygon points="10,2 14,10 10,18 6,10" fill="currentColor" opacity="0.8" />
                        <circle cx="10" cy="10" r="2" fill="#fdfaf3" />
                      </svg>
                      <div className="mushaf-cartouche basmala">
                        {BASMALA_TEXT}
                      </div>
                      <svg className="endcap" viewBox="0 0 20 20" aria-hidden>
                        <polygon points="10,2 14,10 10,18 6,10" fill="currentColor" opacity="0.8" />
                        <circle cx="10" cy="10" r="2" fill="#fdfaf3" />
                      </svg>
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
                      const hifzHide =
                        hifzHidden && !w.isAyahMarker
                          ? hifzHidden.get(w.verseKey)?.has(w.position) ?? false
                          : false;
                      const shouldHide = verseMaskHide || hifzHide;
                      const isHighlighted =
                        highlightedVerseKey === w.verseKey && visibleVerses.has(w.verseKey);
                      const classes = ['verse-word'];
                      if (shouldHide) classes.push('hidden');
                      if (isHighlighted) classes.push('highlighted');
                      if (w.isAyahMarker) classes.push('ayah-marker');
                      return (
                        <span
                          key={`${line.line}-${i}`}
                          className={classes.join(' ')}
                          data-verse={w.verseKey}
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
