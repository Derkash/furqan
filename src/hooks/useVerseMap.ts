'use client';

import { useState, useEffect } from 'react';

export interface VerseBox {
  line: number;
  top: number;
  height: number;
  left: number;
  right: number;
  width: number;
}

export interface VerseMapEntry {
  surah: number;
  verse: number;
  segments: Array<{
    line: number;
    startWord: number;
    endWord: number;
    totalWordsOnLine: number;
  }>;
  boxes: VerseBox[];
}

export interface PageVerseMap {
  [verseKey: string]: VerseMapEntry;
}

export interface VerseMap {
  metadata: {
    generatedAt: string;
    totalPages: number;
    layout: {
      marginTop: number;
      marginBottom: number;
      marginLeft: number;
      marginRight: number;
      linesPerPage: number;
      lineHeight: number;
    };
  };
  pages: {
    [pageNumber: string]: PageVerseMap;
  };
}

let verseMapCache: VerseMap | null = null;

/**
 * Hook pour charger et utiliser la cartographie des versets
 */
export function useVerseMap() {
  const [verseMap, setVerseMap] = useState<VerseMap | null>(verseMapCache);
  const [loading, setLoading] = useState(!verseMapCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (verseMapCache) {
      setVerseMap(verseMapCache);
      setLoading(false);
      return;
    }

    async function loadVerseMap() {
      try {
        const response = await fetch('/verse-map.json');
        if (!response.ok) {
          throw new Error('Impossible de charger la cartographie');
        }
        const data = await response.json();
        verseMapCache = data;
        setVerseMap(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }

    loadVerseMap();
  }, []);

  /**
   * Récupère les données d'un verset sur une page
   */
  const getVerseOnPage = (pageNumber: number, verseKey: string): VerseMapEntry | null => {
    if (!verseMap) return null;
    return verseMap.pages[pageNumber]?.[verseKey] || null;
  };

  /**
   * Récupère tous les versets d'une page
   */
  const getPageVerses = (pageNumber: number): PageVerseMap | null => {
    if (!verseMap) return null;
    return verseMap.pages[pageNumber] || null;
  };

  /**
   * Calcule les masques pour cacher tout SAUF un verset donné
   * Retourne un tableau de bounding boxes à masquer (mot par mot)
   * TOUJOURS masquer mot par mot, jamais de gros rectangle
   */
  const getMasksExcludingVerse = (
    pageNumber: number,
    visibleVerseKey: string | null
  ): VerseBox[] => {
    if (!verseMap) return [];

    const pageVerses = verseMap.pages[pageNumber];
    if (!pageVerses) return [];

    const masks: VerseBox[] = [];

    // Masquer tous les versets SAUF le visible (mot par mot)
    for (const [verseKey, verse] of Object.entries(pageVerses)) {
      // Si c'est le verset visible, on ne le masque pas
      if (verseKey === visibleVerseKey) continue;

      // Ajouter chaque box du verset (chaque segment de ligne)
      for (const box of verse.boxes) {
        masks.push(box);
      }
    }

    return masks;
  };

  return {
    verseMap,
    loading,
    error,
    getVerseOnPage,
    getPageVerses,
    getMasksExcludingVerse,
    layout: verseMap?.metadata.layout || null
  };
}
