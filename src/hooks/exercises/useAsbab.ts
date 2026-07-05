'use client';

import { useCallback, useRef, useState } from 'react';

// Sabab an-nuzûl par verset. Source : Sahih Asbab al-Nuzul (Ibrahim Muhammad
// al-Ali — occasions authentifiées uniquement), traduit hors-ligne par
// scripts/generate-asbab-fr.mjs. `fr` = traduction IA, `ar` = texte original
// conservé pour vérification. Absence de clé = aucun sabab authentifié.
export interface AsbabOccasion {
  fr: string;
  ar: string;
}
type AsbabMap = Record<string, AsbabOccasion[]>;

/**
 * Charge à la demande le fichier des asbab (comme la traduction Hamidullah) :
 * le JSON n'est récupéré qu'au premier appel à `load()`.
 */
export function useAsbab() {
  const [asbab, setAsbab] = useState<AsbabMap | null>(null);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const load = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    fetch('/asbab-fr.json')
      .then((r) => r.json())
      .then((data: AsbabMap) => setAsbab(data))
      .catch(() => {
        // Échec réseau : on autorise une nouvelle tentative au prochain besoin.
        startedRef.current = false;
      })
      .finally(() => setLoading(false));
  }, []);

  return { asbab, loading, load };
}
