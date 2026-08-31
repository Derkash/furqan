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
  /** Masque le numéro de page (badge app + numéro imprimé) — « Quelle page ? ». */
  hidePageNumber?: boolean;
  singlePage?: boolean; // Afficher une seule page (la page courante)
  currentPage?: number; // Numéro de la page courante (pour mode singlePage)
  hifzLevel?: number; // Niveau de Hifz (0-8)
  revealFraction?: number; // Fraction du verset révélée en sixièmes (1-6)
  onTap: () => void;
}

/**
 * PAYSAGE : toujours DEUX pages côte à côte — impaire (1, 3, 5…) à DROITE,
 * paire (2, 4, 6…) à GAUCHE, collées bord à bord.
 * PORTRAIT : toujours UNE SEULE page — celle passée en `currentPage` (les
 * écrans feuillettent alors page par page), à défaut la page impaire du couple.
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
  hidePageNumber = false,
  singlePage = false,
  currentPage,
  hifzLevel,
  revealFraction,
  onTap,
}: MushafDoublePageProps) {
  const isLandscape = orientation === 'landscape';

  // Page unique : demandé explicitement (singlePage) OU portrait — en portrait
  // on n'empile plus deux pages, on n'en montre qu'UNE.
  if (singlePage || !isLandscape) {
    // La page à montrer : celle demandée si elle appartient au couple chargé,
    // sinon la page impaire (droite) — jamais d'écran vide.
    const shown =
      currentPage === pagePair.leftPage || currentPage === pagePair.rightPage
        ? currentPage
        : pagePair.rightPage;
    const pageVerses = shown === pagePair.rightPage ? rightPageVerses : leftPageVerses;

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
        <div style={{ height: '100%', maxWidth: '100%', aspectRatio: '759 / 1080' }}>
          <MushafPage
            pageNumber={shown}
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
            hidePageNumber={hidePageNumber}
            hifzLevel={hifzLevel}
            revealFraction={revealFraction}
            loading={loading && !pageVerses}
          />
        </div>
      </div>
    );
  }

  // PAYSAGE — page impaire (rightPage) à DROITE, page paire (leftPage) à GAUCHE.
  // En flex row (LTR forcé) : le premier enfant est donc la page PAIRE.
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex',
        flexDirection: 'row',
        direction: 'ltr', // Force LTR pour que le premier enfant soit à GAUCHE
        width: '100%',
        height: '100%',
        gap: 0,
        margin: 0,
        padding: 0,
        cursor: 'pointer',
      }}
    >
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
          hidePageNumber={hidePageNumber}
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
          hidePageNumber={hidePageNumber}
          hifzLevel={hifzLevel}
          revealFraction={revealFraction}
          loading={loading && !rightPageVerses}
        />
      </div>
    </div>
  );
}
