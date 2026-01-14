'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import type { PageVerses } from '@/types';
import BlurOverlay from './BlurOverlay';
import { useVerseMap } from '@/hooks/useVerseMap';
import { PAGE_BACKGROUND } from '@/utils/maskCalculations';

interface MushafPageProps {
  pageNumber: number;
  pageVerses: PageVerses | null;
  revealedVerses: Set<string>;
  visibleVerses?: Set<string>;
  isBlurred?: boolean;
  maskAll?: boolean;
  loading?: boolean;
}

// ============================================
// CALIBRATION - Ajuster ces valeurs pour aligner les masques
// ============================================
// Calibration pour pages IMPAIRES (droite de l'écran)
const CALIBRATION_ODD = {
  marginTop: 12.2,
  marginBottom: 9.2,
  marginLeft: 9.12,
  marginRight: 19.12,
  linesPerPage: 15,
  lineHeight: 5.10,
};

// Calibration pour pages PAIRES (gauche de l'écran)
// Décalée de 6% vers la gauche et 0.5% vers le haut
const CALIBRATION_EVEN = {
  marginTop: CALIBRATION_ODD.marginTop - 0.5, // 0.5% vers le haut
  marginBottom: CALIBRATION_ODD.marginBottom + 0.5,
  marginLeft: CALIBRATION_ODD.marginLeft + 7.5, // 7.5% vers la gauche
  marginRight: CALIBRATION_ODD.marginRight - 7.5, // 7.5% vers la gauche
  linesPerPage: 15,
  lineHeight: 5.10,
};

// Fonction pour obtenir la calibration selon la parité
const getCalibration = (pageNumber: number) => {
  return pageNumber % 2 === 1 ? CALIBRATION_ODD : CALIBRATION_EVEN;
};

// Calcul de la hauteur de ligne (même pour les deux)
const LINE_HEIGHT = CALIBRATION_ODD.lineHeight ||
  (100 - CALIBRATION_ODD.marginTop - CALIBRATION_ODD.marginBottom) / CALIBRATION_ODD.linesPerPage;

// Mode debug - mettre à true pour voir les indicateurs de lignes
const DEBUG_MODE = false;

// Mode debug couleurs - mettre à true pour voir l'échantillonnage de couleurs
const COLOR_DEBUG_MODE = false;

// Palette de couleurs pour le masquage (élargie)
const COLOR_SAMPLES = [
  // Blancs
  { id: 1, color: '#ffffff' },
  { id: 2, color: '#fffffe' },
  { id: 3, color: '#fffffc' },
  { id: 4, color: '#fffefa' },
  { id: 5, color: '#fffef8' },
  // Blancs chauds
  { id: 6, color: '#fffdf5' },
  { id: 7, color: '#fffcf2' },
  { id: 8, color: '#fffbf0' },
  { id: 9, color: '#fffaed' },
  { id: 10, color: '#fff9ea' },
  // Crèmes clairs
  { id: 11, color: '#fff8e7' },
  { id: 12, color: '#fff7e4' },
  { id: 13, color: '#fff6e1' },
  { id: 14, color: '#fff5de' },
  { id: 15, color: '#fff4db' },
  // Crèmes
  { id: 16, color: '#fdfaf3' },
  { id: 17, color: '#fcf9f1' },
  { id: 18, color: '#fbf8ef' },
  { id: 19, color: '#faf7ed' },
  { id: 20, color: '#f9f6eb' },
  // Ivoires
  { id: 21, color: '#f8f5e9' },
  { id: 22, color: '#f7f4e7' },
  { id: 23, color: '#f6f3e5' },
  { id: 24, color: '#f5f2e3' },
  { id: 25, color: '#f4f1e1' },
  // Beiges clairs
  { id: 26, color: '#f3f0df' },
  { id: 27, color: '#f2efdd' },
  { id: 28, color: '#f1eedb' },
  { id: 29, color: '#f0edd9' },
  { id: 30, color: '#efecd7' },
  // Parchemins
  { id: 31, color: '#eeebd5' },
  { id: 32, color: '#edead3' },
  { id: 33, color: '#ece9d1' },
  { id: 34, color: '#ebe8cf' },
  { id: 35, color: '#eae7cd' },
  // Sables
  { id: 36, color: '#e9e6cb' },
  { id: 37, color: '#e8e5c9' },
  { id: 38, color: '#e7e4c7' },
  { id: 39, color: '#e6e3c5' },
  { id: 40, color: '#e5e2c3' },
];

/**
 * Composant d'affichage d'une page du Mushaf
 */
export default function MushafPage({
  pageNumber,
  pageVerses,
  revealedVerses,
  visibleVerses = new Set(),
  isBlurred = false,
  maskAll = false,
  loading = false,
}: MushafPageProps) {
  const { getVerseOnPage, getPageVerses: getVerseMapPage, loading: mapLoading } = useVerseMap();

  // Récupérer les données de la page depuis verse-map
  const pageData = useMemo(() => {
    return getVerseMapPage(pageNumber);
  }, [pageNumber, getVerseMapPage]);

  // Obtenir la calibration pour cette page
  const CALIBRATION = getCalibration(pageNumber);

  // Calculer les masques avec les nouvelles valeurs de calibration
  const masks = useMemo(() => {
    if (isBlurred || !maskAll || !pageData) return [];

    const calibration = getCalibration(pageNumber);
    const masks: Array<{
      top: number;
      height: number;
      left: number;
      right: number;
      verseKey: string;
    }> = [];

    for (const [verseKey, verse] of Object.entries(pageData)) {
      if (visibleVerses.has(verseKey)) continue;

      for (const segment of verse.segments) {
        const { line, startWord, endWord, totalWordsOnLine } = segment;

        // Calcul de la position verticale avec calibration
        const top = calibration.marginTop + (line - 1) * LINE_HEIGHT;
        const height = LINE_HEIGHT;

        // Calcul de la position horizontale (RTL)
        const lineWidth = 100 - calibration.marginLeft - calibration.marginRight;
        const wordWidth = lineWidth / totalWordsOnLine;

        // En RTL: mot 0 est à droite
        const right = calibration.marginRight + (startWord * wordWidth);
        const left = calibration.marginLeft + ((totalWordsOnLine - 1 - endWord) * wordWidth);

        masks.push({ top, height, left, right, verseKey });
      }
    }

    return masks;
  }, [pageData, visibleVerses, isBlurred, maskAll, pageNumber]);

  const imageSrc = `/mushaf-pages/page-${pageNumber.toString().padStart(3, '0')}.png`;

  // Générer les lignes de debug
  const debugLines = useMemo(() => {
    if (!DEBUG_MODE) return [];
    const calibration = getCalibration(pageNumber);
    return Array.from({ length: calibration.linesPerPage }, (_, i) => ({
      line: i + 1,
      top: calibration.marginTop + i * LINE_HEIGHT,
    }));
  }, [pageNumber]);

  // Générer les indicateurs de début/fin de versets
  const verseMarkers = useMemo(() => {
    if (!DEBUG_MODE || !pageData) return [];

    const calibration = getCalibration(pageNumber);
    const markers: Array<{
      verseKey: string;
      line: number;
      top: number;
      startPos: number; // position horizontale du début (depuis la droite en RTL)
      endPos: number;   // position horizontale de la fin (depuis la gauche en RTL)
      isStart: boolean; // true si c'est le début du verset sur cette page
      isEnd: boolean;   // true si c'est la fin du verset sur cette page
    }> = [];

    const lineWidth = 100 - calibration.marginLeft - calibration.marginRight;

    for (const [verseKey, verse] of Object.entries(pageData)) {
      const segments = verse.segments;

      segments.forEach((segment, idx) => {
        const { line, startWord, endWord, totalWordsOnLine } = segment;
        const wordWidth = lineWidth / totalWordsOnLine;

        const top = calibration.marginTop + (line - 1) * LINE_HEIGHT;

        // Position du début (premier mot, à droite en RTL)
        const startPos = calibration.marginRight + (startWord * wordWidth);
        // Position de la fin (dernier mot, à gauche en RTL)
        const endPos = calibration.marginLeft + ((totalWordsOnLine - 1 - endWord) * wordWidth);

        markers.push({
          verseKey,
          line,
          top,
          startPos,
          endPos,
          isStart: idx === 0,
          isEnd: idx === segments.length - 1,
        });
      });
    }

    return markers;
  }, [pageData, pageNumber]);

  // Alignement pour coller les pages au milieu
  // Page paire (gauche de l'écran) → alignée à droite (flex-end)
  // Page impaire (droite de l'écran) → alignée à gauche (flex-start)
  const isOddPage = pageNumber % 2 === 1;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isOddPage ? 'flex-start' : 'flex-end',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Conteneur avec ratio fixe 759:1100 */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '759 / 1100',
          height: '100%',
          maxWidth: '100%',
        }}
      >
        {/* Image de la page */}
        <Image
          src={imageSrc}
          alt={`Page ${pageNumber}`}
          fill
          style={{ objectFit: 'contain' }}
          priority={pageNumber <= 10}
          sizes="50vw"
        />

        {/* BlurOverlay */}
        <BlurOverlay isActive={isBlurred} />

        {/* DEBUG: Échantillonnage de couleurs en bas de page */}
        {COLOR_DEBUG_MODE && isOddPage && (
          <div
            style={{
              position: 'absolute',
              bottom: '5px',
              left: 0,
              right: 0,
              zIndex: 100,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            {COLOR_SAMPLES.map((sample) => (
              <div
                key={sample.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    backgroundColor: sample.color,
                  }}
                />
                <span style={{ fontSize: '7px', fontWeight: 'bold' }}>{sample.id}</span>
              </div>
            ))}
          </div>
        )}

        {/* GROS ENCART DE DEBUG POUR CALIBRATION */}
        {DEBUG_MODE && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              border: '4px solid magenta',
              backgroundColor: 'rgba(255, 0, 255, 0.1)',
              zIndex: 50,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: '20px',
            }}
          >
            <span
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: 'magenta',
                backgroundColor: 'white',
                padding: '8px 16px',
              }}
            >
              Page {pageNumber} ({pageNumber % 2 === 1 ? 'IMPAIRE' : 'PAIRE'})
            </span>
          </div>
        )}


        {/* DEBUG: Indicateurs de lignes */}
        {DEBUG_MODE && debugLines.map((line) => (
          <div
            key={`debug-line-${line.line}`}
            style={{
              position: 'absolute',
              top: `${line.top}%`,
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: 'rgba(255, 0, 0, 0.5)',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            {/* Numéro de ligne à gauche */}
            <span
              style={{
                position: 'absolute',
                left: '2px',
                top: '-8px',
                fontSize: '10px',
                color: 'red',
                backgroundColor: 'white',
                padding: '0 2px',
              }}
            >
              L{line.line}
            </span>
          </div>
        ))}

        {/* DEBUG: Marqueurs de début/fin de versets */}
        {DEBUG_MODE && verseMarkers.map((marker, index) => (
          <div key={`marker-${index}`}>
            {/* Marqueur de début de verset (triangle vert à droite) */}
            {marker.isStart && (
              <div
                style={{
                  position: 'absolute',
                  top: `${marker.top}%`,
                  right: `${marker.startPos}%`,
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderRight: '8px solid #00ff00',
                  zIndex: 25,
                  transform: 'translateY(50%)',
                }}
                title={`Début ${marker.verseKey}`}
              />
            )}
            {/* Marqueur de fin de verset (triangle rouge à gauche) */}
            {marker.isEnd && (
              <div
                style={{
                  position: 'absolute',
                  top: `${marker.top}%`,
                  left: `${marker.endPos}%`,
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderLeft: '8px solid #ff0000',
                  zIndex: 25,
                  transform: 'translateY(50%)',
                }}
                title={`Fin ${marker.verseKey}`}
              />
            )}
            {/* Numéro du verset au début */}
            {marker.isStart && (
              <span
                style={{
                  position: 'absolute',
                  top: `${marker.top + LINE_HEIGHT * 0.2}%`,
                  right: `${marker.startPos + 1}%`,
                  fontSize: '8px',
                  color: '#00aa00',
                  fontWeight: 'bold',
                  zIndex: 25,
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  padding: '0 2px',
                }}
              >
                {marker.verseKey}
              </span>
            )}
          </div>
        ))}

        {/* DEBUG: Bordures de la zone de texte */}
        {DEBUG_MODE && (
          <>
            {/* Bordure haute */}
            <div
              style={{
                position: 'absolute',
                top: `${CALIBRATION.marginTop}%`,
                left: `${CALIBRATION.marginLeft}%`,
                right: `${CALIBRATION.marginRight}%`,
                height: '2px',
                backgroundColor: 'blue',
                zIndex: 20,
              }}
            />
            {/* Bordure basse */}
            <div
              style={{
                position: 'absolute',
                bottom: `${CALIBRATION.marginBottom}%`,
                left: `${CALIBRATION.marginLeft}%`,
                right: `${CALIBRATION.marginRight}%`,
                height: '2px',
                backgroundColor: 'blue',
                zIndex: 20,
              }}
            />
            {/* Bordure gauche */}
            <div
              style={{
                position: 'absolute',
                top: `${CALIBRATION.marginTop}%`,
                bottom: `${CALIBRATION.marginBottom}%`,
                left: `${CALIBRATION.marginLeft}%`,
                width: '2px',
                backgroundColor: 'green',
                zIndex: 20,
              }}
            />
            {/* Bordure droite */}
            <div
              style={{
                position: 'absolute',
                top: `${CALIBRATION.marginTop}%`,
                bottom: `${CALIBRATION.marginBottom}%`,
                right: `${CALIBRATION.marginRight}%`,
                width: '2px',
                backgroundColor: 'green',
                zIndex: 20,
              }}
            />
          </>
        )}

        {/* Masques mot par mot */}
        {masks.map((box, index) => (
          <div
            key={`mask-${index}`}
            style={{
              position: 'absolute',
              top: `${box.top}%`,
              height: `${box.height}%`,
              left: `${box.left}%`,
              right: `${box.right}%`,
              backgroundColor: DEBUG_MODE ? 'rgba(253, 250, 243, 0.85)' : PAGE_BACKGROUND,
              border: DEBUG_MODE ? '1px solid orange' : 'none',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Indicateur de chargement */}
        {(loading || mapLoading) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(253, 250, 243, 0.8)',
              zIndex: 30,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: '4px solid #2d5016',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
