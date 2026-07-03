'use client';

import { useEffect, useState } from 'react';
import { splitArabicWords } from '@/utils/exercises/arabicNormalization';
import type { RecitationWord } from '@/lib/exercises/recitationMatcher';

export interface RecitationVerse {
  verseKey: string;
  surah: number;
  ayah: number;
  page: number;
  /** Mots de la basmala (optionnels) inclus en tête si le verset ouvre une sourate. */
  words: RecitationWord[];
  hasBasmala: boolean;
}

interface ApiAyah {
  text: string;
  numberInSurah: number;
  surah: { number: number };
}

// Texte lisible (édition quran-simple) — même fournisseur que l'audio (islamic.network).
const API_URL = (page: number) => `https://api.alquran.cloud/v1/page/${page}/quran-simple`;

// Cache module : une page déjà chargée ne l'est plus jamais dans la session.
const pageCache = new Map<number, ApiAyah[]>();

const BASMALA_NORMS = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

function buildVerse(ayah: ApiAyah, page: number): RecitationVerse {
  const surah = ayah.surah.number;
  const verseKey = `${surah}:${ayah.numberInSurah}`;
  const tokens = splitArabicWords(ayah.text);

  // L'API préfixe la basmala au 1er verset de chaque sourate (sauf Al-Fatiha où
  // elle EST le verset 1, et At-Tawba qui n'en a pas) : on la marque optionnelle.
  const hasBasmala =
    ayah.numberInSurah === 1 &&
    surah !== 1 &&
    surah !== 9 &&
    tokens.length > BASMALA_NORMS.length &&
    BASMALA_NORMS.every((n, i) => tokens[i].norm === n);

  const words: RecitationWord[] = tokens.map((t, i) => ({
    display: t.display,
    norm: t.norm,
    verseKey,
    optional: hasBasmala && i < BASMALA_NORMS.length ? true : undefined,
  }));

  return { verseKey, surah, ayah: ayah.numberInSurah, page, words, hasBasmala };
}

/**
 * Charge le texte des versets d'une plage de pages du Mushaf (604 pages Médine),
 * prêt pour l'exercice de récitation (mots affichables + formes normalisées).
 */
export function useRecitationVerses(startPage: number, endPage: number) {
  const [verses, setVerses] = useState<RecitationVerse[] | null>(null);
  const [loadedPages, setLoadedPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalPages = endPage - startPage + 1;

  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setLoadedPages(0);
    setError(null);

    async function load() {
      const pages: number[] = [];
      for (let p = startPage; p <= endPage; p++) pages.push(p);

      const byPage = new Map<number, ApiAyah[]>();
      let done = 0;
      // Chargement par petits lots pour ne pas mitrailler l'API sur les grandes plages.
      const CHUNK = 6;
      for (let i = 0; i < pages.length; i += CHUNK) {
        const chunk = pages.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(async (p) => {
            if (pageCache.has(p)) {
              byPage.set(p, pageCache.get(p)!);
            } else {
              const res = await fetch(API_URL(p));
              if (!res.ok) throw new Error(`page ${p}: HTTP ${res.status}`);
              const json = await res.json();
              const ayahs = (json?.data?.ayahs ?? []) as ApiAyah[];
              pageCache.set(p, ayahs);
              byPage.set(p, ayahs);
            }
            done++;
            if (!cancelled) setLoadedPages(done);
          })
        );
        if (cancelled) return;
      }

      const result: RecitationVerse[] = [];
      const seen = new Set<string>();
      for (const p of pages) {
        for (const ayah of byPage.get(p) ?? []) {
          const key = `${ayah.surah.number}:${ayah.numberInSurah}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(buildVerse(ayah, p));
        }
      }
      if (!cancelled) setVerses(result);
    }

    load().catch(() => {
      if (!cancelled) setError('Impossible de charger le texte des versets. Vérifiez votre connexion.');
    });

    return () => {
      cancelled = true;
    };
  }, [startPage, endPage]);

  return { verses, loading: verses === null && !error, loadedPages, totalPages, error };
}
