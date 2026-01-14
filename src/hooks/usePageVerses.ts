'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  PageVerses,
  VersePosition,
  MushafLayoutPage,
  MushafLayoutLine,
  MushafLayoutWord,
} from '@/types';
import { toGlobalAyahNumber, parseWordLocation, getVerseKey } from '@/utils/ayahMapping';

const LAYOUT_BASE_URL =
  'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf';

// Cache pour les données de layout
const layoutCache = new Map<number, PageVerses>();

/**
 * Convertit les données de layout JSON en positions de versets
 */
function parseLayoutToVerses(layoutData: MushafLayoutPage): PageVerses {
  const versesMap = new Map<string, VersePosition>();

  for (const line of layoutData.lines) {
    // Ignorer les en-têtes de sourate et basmala sans mots
    if (line.type === 'surah-header' || !line.words) continue;

    for (const word of line.words) {
      const { surah, verse } = parseWordLocation(word.location);
      const verseKey = getVerseKey(surah, verse);

      if (!versesMap.has(verseKey)) {
        versesMap.set(verseKey, {
          verseKey,
          surah,
          verse,
          page: layoutData.page,
          lines: [line.line],
          globalNumber: toGlobalAyahNumber(surah, verse),
        });
      } else {
        const existing = versesMap.get(verseKey)!;
        if (!existing.lines.includes(line.line)) {
          existing.lines.push(line.line);
          existing.lines.sort((a, b) => a - b);
        }
      }
    }
  }

  const verses = Array.from(versesMap.values()).sort(
    (a, b) => a.globalNumber - b.globalNumber
  );

  return {
    page: layoutData.page,
    verses,
    firstVerse: verses.length > 0 ? verses[0] : null,
    lastVerse: verses.length > 0 ? verses[verses.length - 1] : null,
  };
}

/**
 * Hook pour récupérer les données de versets d'une page
 */
export function usePageVerses(pageNumber: number) {
  const [data, setData] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPageLayout = useCallback(async (page: number) => {
    // Vérifier le cache
    if (layoutCache.has(page)) {
      return layoutCache.get(page)!;
    }

    const paddedPage = page.toString().padStart(3, '0');
    const url = `${LAYOUT_BASE_URL}/page-${paddedPage}.json`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur lors du chargement de la page ${page}`);
    }

    const layoutData: MushafLayoutPage = await response.json();
    const pageVerses = parseLayoutToVerses(layoutData);

    // Mettre en cache
    layoutCache.set(page, pageVerses);

    return pageVerses;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (pageNumber < 1 || pageNumber > 604) {
        setError('Numéro de page invalide');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const pageVerses = await fetchPageLayout(pageNumber);
        if (isMounted) {
          setData(pageVerses);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [pageNumber, fetchPageLayout]);

  return { data, loading, error };
}

/**
 * Hook pour précharger les pages adjacentes
 */
export function usePrefetchPages(currentPage: number) {
  useEffect(() => {
    const pagesToPrefetch = [currentPage - 2, currentPage - 1, currentPage + 1, currentPage + 2];

    pagesToPrefetch.forEach(async (page) => {
      if (page >= 1 && page <= 604 && !layoutCache.has(page)) {
        try {
          const paddedPage = page.toString().padStart(3, '0');
          const url = `${LAYOUT_BASE_URL}/page-${paddedPage}.json`;
          const response = await fetch(url);
          if (response.ok) {
            const layoutData: MushafLayoutPage = await response.json();
            layoutCache.set(page, parseLayoutToVerses(layoutData));
          }
        } catch {
          // Ignorer les erreurs de préchargement
        }
      }
    });
  }, [currentPage]);
}

/**
 * Fonction utilitaire pour récupérer les versets d'une page (sans hook)
 */
export async function fetchPageVerses(pageNumber: number): Promise<PageVerses> {
  if (layoutCache.has(pageNumber)) {
    return layoutCache.get(pageNumber)!;
  }

  const paddedPage = pageNumber.toString().padStart(3, '0');
  const url = `${LAYOUT_BASE_URL}/page-${paddedPage}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur lors du chargement de la page ${pageNumber}`);
  }

  const layoutData: MushafLayoutPage = await response.json();
  const pageVerses = parseLayoutToVerses(layoutData);

  layoutCache.set(pageNumber, pageVerses);
  return pageVerses;
}
