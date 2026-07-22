'use client';

import type { Orientation, PagePair, PageVerses } from '@/types';
import MushafPage from './MushafPage';

interface MushafDoublePageProps {
  leftPageVerses: PageVerses | null;
  rightPageVerses: PageVerses | null;
  pagePair: PagePair;
  orientation: Orientation;
  revealedVerses: Set<string>;
  visibleVerses?: Set<string>;
  highlightedVerseKey?: string;
  /** Versets à surligner en jaune (en plus de highlightedVerseKey) — demi-page. */
  extraHighlightVerseKeys?: Set<string>;
  isBlurred?: boolean;
  maskAll?: boolean;
  loading?: boolean;
  /** Marques par mot, clés "verseKey#position" → 'selected' ou type de faute. */
  wordMarks?: Map<string, string>;
  /** Numéros de fin de verset à entourer en rouge (par verseKey). */
  circledMarkerVerseKeys?: Set<string>;
  /** Thèmes de tafsir : verseKey → n° de groupe (teinte partagée par groupe). */
  verseThemes?: Record<string, number> | null;
  singlePage?: boolean; // Afficher une seule page (la page courante)
  currentPage?: number; // Numéro de la page courante (pour mode singlePage)
  hifzLevel?: number; // Niveau de Hifz (0-8)
  revealFraction?: number; // Fraction du verset révélée en sixièmes (1-6)
  onTap: () => void;
}

/**
 * Affiche deux pages du Mushaf côte à côte (paysage) ou empilées (portrait)
 * Page IMPAIRE (1, 3, 5...) à DROITE
 * Page PAIRE (2, 4, 6...) à GAUCHE
 * Images collées bord à bord sans aucun espace
 */
export default function MushafDoublePage({
  leftPageVerses,
  rightPageVerses,
  pagePair,
  orientation,
  revealedVerses,
  visibleVerses = new Set(),
  highlightedVerseKey,
  extraHighlightVerseKeys,
  isBlurred = false,
  maskAll = false,
  loading = false,
  wordMarks,
  circledMarkerVerseKeys,
  verseThemes,
  singlePage = false,
  currentPage,
  hifzLevel,
  revealFraction,
  onTap,
}: MushafDoublePageProps) {
  const isLandscape = orientation === 'landscape';

  // Mode page unique : afficher seulement la page courante
  if (singlePage && currentPage !== undefined) {
    const isCurrentPageRight = currentPage === pagePair.rightPage;
    const pageVerses = isCurrentPageRight ? rightPageVerses : leftPageVerses;

    return (
      <div
        onClick={onTap}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          cursor: 'pointer',
        }}
      >
        <div style={{ height: '100%', maxWidth: '100%', aspectRatio: '0.7' }}>
          <MushafPage
            pageNumber={currentPage}
            pageVerses={pageVerses}
            revealedVerses={revealedVerses}
            visibleVerses={visibleVerses}
            highlightedVerseKey={highlightedVerseKey}
            extraHighlightVerseKeys={extraHighlightVerseKeys}
            isBlurred={isBlurred}
            maskAll={maskAll}
              wordMarks={wordMarks}
              circledMarkerVerseKeys={circledMarkerVerseKeys}
              verseThemes={verseThemes}
            hifzLevel={hifzLevel}
            revealFraction={revealFraction}
            loading={loading && !pageVerses}
          />
        </div>
      </div>
    );
  }

  // Page impaire (rightPage) à DROITE, page paire (leftPage) à GAUCHE
  // En flex row: on affiche d'abord gauche puis droite
  // leftPage = page paire, rightPage = page impaire

  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex',
        flexDirection: isLandscape ? 'row' : 'column',
        direction: 'ltr', // Force LTR pour que le premier enfant soit à GAUCHE
        width: '100%',
        height: '100%',
        gap: 0,
        margin: 0,
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {isLandscape ? (
        <>
          {/* GAUCHE de l'écran = page PAIRE (leftPage) */}
          <div style={{ flex: 1, height: '100%', margin: 0, padding: 0 }}>
            <MushafPage
              pageNumber={pagePair.leftPage}
              pageVerses={leftPageVerses}
              revealedVerses={revealedVerses}
              visibleVerses={visibleVerses}
              highlightedVerseKey={highlightedVerseKey}
              extraHighlightVerseKeys={extraHighlightVerseKeys}
              isBlurred={isBlurred}
              maskAll={maskAll}
              wordMarks={wordMarks}
              circledMarkerVerseKeys={circledMarkerVerseKeys}
              verseThemes={verseThemes}
              hifzLevel={hifzLevel}
              revealFraction={revealFraction}
              loading={loading && !leftPageVerses}
            />
          </div>

          {/* DROITE de l'écran = page IMPAIRE (rightPage) */}
          <div style={{ flex: 1, height: '100%', margin: 0, padding: 0 }}>
            <MushafPage
              pageNumber={pagePair.rightPage}
              pageVerses={rightPageVerses}
              revealedVerses={revealedVerses}
              visibleVerses={visibleVerses}
              highlightedVerseKey={highlightedVerseKey}
              extraHighlightVerseKeys={extraHighlightVerseKeys}
              isBlurred={isBlurred}
              maskAll={maskAll}
              wordMarks={wordMarks}
              circledMarkerVerseKeys={circledMarkerVerseKeys}
              verseThemes={verseThemes}
              hifzLevel={hifzLevel}
              revealFraction={revealFraction}
              loading={loading && !rightPageVerses}
            />
          </div>
        </>
      ) : (
        <>
          {/* En portrait: page impaire en HAUT (on lit de haut en bas, droite d'abord) */}
          <div style={{ flex: 1, minHeight: 0, margin: 0, padding: 0 }}>
            <MushafPage
              pageNumber={pagePair.rightPage}
              pageVerses={rightPageVerses}
              revealedVerses={revealedVerses}
              visibleVerses={visibleVerses}
              highlightedVerseKey={highlightedVerseKey}
              extraHighlightVerseKeys={extraHighlightVerseKeys}
              isBlurred={isBlurred}
              maskAll={maskAll}
              wordMarks={wordMarks}
              circledMarkerVerseKeys={circledMarkerVerseKeys}
              verseThemes={verseThemes}
              hifzLevel={hifzLevel}
              revealFraction={revealFraction}
              loading={loading && !rightPageVerses}
            />
          </div>

          {/* Page paire en BAS */}
          <div style={{ flex: 1, minHeight: 0, margin: 0, padding: 0 }}>
            <MushafPage
              pageNumber={pagePair.leftPage}
              pageVerses={leftPageVerses}
              revealedVerses={revealedVerses}
              visibleVerses={visibleVerses}
              highlightedVerseKey={highlightedVerseKey}
              extraHighlightVerseKeys={extraHighlightVerseKeys}
              isBlurred={isBlurred}
              maskAll={maskAll}
              wordMarks={wordMarks}
              circledMarkerVerseKeys={circledMarkerVerseKeys}
              verseThemes={verseThemes}
              hifzLevel={hifzLevel}
              revealFraction={revealFraction}
              loading={loading && !leftPageVerses}
            />
          </div>
        </>
      )}
    </div>
  );
}
