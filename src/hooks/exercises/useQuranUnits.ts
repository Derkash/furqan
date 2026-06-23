'use client';

import { useEffect, useState } from 'react';
import type { QuranUnits } from '@/utils/exercises/rangeToPages';

/**
 * Charge les données chapters / hizbs / juzs nécessaires pour convertir
 * une plage (hizb/juz/sourate) en plage de pages.
 */
export function useQuranUnits(): { data: QuranUnits | null; loading: boolean } {
  const [data, setData] = useState<QuranUnits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/qcf-data/chapters.json').then((r) => r.json()),
      fetch('/qcf-data/hizbs.json').then((r) => r.json()),
      fetch('/qcf-data/juzs.json').then((r) => r.json()),
    ])
      .then(([chapters, hizbs, juzs]) => {
        if (!cancelled) setData({ chapters, hizbs, juzs });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
