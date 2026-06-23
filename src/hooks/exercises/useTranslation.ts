'use client';

import { useCallback, useRef, useState } from 'react';

type TranslationMap = Record<string, string>;

/**
 * Charge à la demande la traduction française (Hamidullah) depuis public/.
 * Le JSON (~1 Mo) n'est PAS inclus dans le bundle JS : il est récupéré au
 * premier appel à `load()` (ex. premier tap sur un verset).
 */
export function useTranslation() {
  const [translations, setTranslations] = useState<TranslationMap | null>(null);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const load = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    fetch('/qcf-data/translation-hamidullah.fr.json')
      .then((r) => r.json())
      .then((data: TranslationMap) => setTranslations(data))
      .catch(() => {
        // Échec réseau : on autorise une nouvelle tentative au prochain besoin.
        startedRef.current = false;
      })
      .finally(() => setLoading(false));
  }, []);

  return { translations, loading, load };
}
