'use client';

// Débuts du premier verset de chaque page (texte othmanien Unicode, source
// mushaf-layout — jamais régénéré). Le repère qui évite de se perdre : on
// reconnaît sa page à son verset, pas à son numéro. Partagé par le parcours
// « Récitation en cours » et l'écran « J'ai récité en avance ».

import { useEffect, useState } from 'react';
import { pageFirstVerseHead } from '@/lib/recitation/passageText';

export function usePageVerseHeads(pages: number[]): Record<number, string> {
  const [heads, setHeads] = useState<Record<number, string>>({});
  const key = pages.join(',');
  useEffect(() => {
    let cancelled = false;
    Promise.all(pages.map((p) => pageFirstVerseHead(p, 6).then((t) => [p, t] as const)))
      .then((entries) => {
        if (!cancelled) setHeads(Object.fromEntries(entries.filter(([, t]) => t)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return heads;
}
