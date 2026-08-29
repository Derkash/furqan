'use client';

import { useEffect, useState } from 'react';
import type { VocabEntry } from '@/utils/vocab/vocabStore';
import { scopeVocabToPages, type ScopedEntry } from '@/utils/vocab/rangeScope';

/**
 * Restreint le lexique aux mots RÉELLEMENT PRÉSENTS dans la plage de pages.
 * Renvoie `null` tant qu'aucune plage n'est définie (→ lexique entier).
 */
export function useScopedVocab(
  entries: VocabEntry[],
  startPage: number | null,
  endPage: number | null
): { scoped: ScopedEntry[] | null; loading: boolean } {
  const [scoped, setScoped] = useState<ScopedEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Mushaf entier ⇒ aucun filtrage (et on évite de charger les 114 sourates).
    const full =
      startPage != null && endPage != null &&
      Math.min(startPage, endPage) <= 1 &&
      Math.max(startPage, endPage) >= 604;
    if (startPage == null || endPage == null || full) {
      setScoped(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    scopeVocabToPages(entries, startPage, endPage)
      .then((r) => {
        if (!cancelled) setScoped(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entries, startPage, endPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { scoped, loading };
}
