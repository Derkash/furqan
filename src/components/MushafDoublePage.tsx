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
  isBlurred?: boolean;
  maskAll?: boolean;
  loading?: boolean;
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
  isBlurred = false,
  maskAll = false,
  loading = false,
  onTap,
}: MushafDoublePageProps) {
  const isLandscape = orientation === 'landscape';

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
              isBlurred={isBlurred}
              maskAll={maskAll}
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
              isBlurred={isBlurred}
              maskAll={maskAll}
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
              isBlurred={isBlurred}
              maskAll={maskAll}
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
              isBlurred={isBlurred}
              maskAll={maskAll}
              loading={loading && !leftPageVerses}
            />
          </div>
        </>
      )}
    </div>
  );
}
