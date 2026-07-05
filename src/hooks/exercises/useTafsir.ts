'use client';

import { useEffect, useState } from 'react';

// Tafsir français verset par verset : Al-Mukhtasar fi at-Tafsir (Tafsir Center),
// seule exégèse française complète disponible par ayah via CDN (Ibn Kathir
// n'existe pas en français via API).
const TAFSIR_URL = (surah: string, ayah: string) =>
  `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/french-mokhtasar/${surah}/${ayah}.json`;

const cache = new Map<string, Promise<string | null>>();

function fetchTafsir(verseKey: string): Promise<string | null> {
  if (!cache.has(verseKey)) {
    const [surah, ayah] = verseKey.split(':');
    cache.set(
      verseKey,
      fetch(TAFSIR_URL(surah, ayah))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d?.text as string | undefined) ?? null)
        .catch(() => {
          // Échec réseau : on retentera au prochain besoin.
          cache.delete(verseKey);
          return null;
        })
    );
  }
  return cache.get(verseKey)!;
}

/** Charge le tafsir français du verset demandé (null tant que non chargé). */
export function useTafsir(verseKey: string | null) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!verseKey) {
      setText(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setText(null);
    setLoading(true);
    fetchTafsir(verseKey).then((t) => {
      if (!cancelled) {
        setText(t);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [verseKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { text, loading };
}
