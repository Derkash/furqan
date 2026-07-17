'use client';

import { useEffect, useState } from 'react';

// Tafsir Ibn Kathir (abrégé) en français.
// 1. Sourates 1-7 et Juz 'Amma : fichiers statiques pré-traduits
//    (public/ibn-kathir-fr/, générés par scripts/generate-ibn-kathir-fr.mjs).
// 2. Reste du Coran : /api/ibn-kathir-fr (traduction à la demande, mise en
//    cache un an sur le CDN — seule la première consultation est lente).

const cache = new Map<string, Promise<string | null>>();

async function fetchStatic(surah: string, ayah: string): Promise<string | null | undefined> {
  const res = await fetch(`/ibn-kathir-fr/${surah}/${ayah}.json`);
  if (!res.ok) return undefined; // pas de fichier statique → API
  const data = await res.json();
  if (data.ref) {
    // Verset membre d'un groupe : le texte est dans le fichier du 1er verset.
    const refRes = await fetch(`/ibn-kathir-fr/${data.ref}.json`);
    if (!refRes.ok) return undefined;
    return ((await refRes.json()).text as string | null) ?? null;
  }
  return (data.text as string | null) ?? null;
}

export function fetchIbnKathir(verseKey: string): Promise<string | null> {
  if (!cache.has(verseKey)) {
    const [surah, ayah] = verseKey.split(':');
    cache.set(
      verseKey,
      (async () => {
        try {
          const staticText = await fetchStatic(surah, ayah);
          if (staticText !== undefined) return staticText;
        } catch {
          // fichier statique illisible → on tente l'API
        }
        const res = await fetch(`/api/ibn-kathir-fr?ayah=${verseKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()).text as string | null) ?? null;
      })().catch(() => {
        cache.delete(verseKey); // on retentera au prochain besoin
        return null;
      })
    );
  }
  return cache.get(verseKey)!;
}

/** Charge le tafsir Ibn Kathir français du verset demandé. */
export function useIbnKathir(verseKey: string | null) {
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
    fetchIbnKathir(verseKey).then((t) => {
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
