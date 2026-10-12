// Traductions CONTEXTUELLES mot à mot, alignées sur Hamidullah, pré-générées
// par page (scripts/generate-contextual-glosses.mjs → public/glosses/page-NNN.json).
// Statique : dispo hors ligne, aucun appel à l'usage. Une page absente (pas
// encore générée) renvoie simplement null → on retombe sur le sens existant.

import { getVersePageMap } from './morphology';
import { apiUrl } from '@/lib/apiUrl';

export interface ContextGloss {
  p: number; // position du mot dans le verset
  g: string; // traduction du mot DANS CE VERSET
  h: string; // portion exacte de Hamidullah qui rend ce mot ("" si aucune)
  n: string; // note si le sens s'écarte du sens usuel
}

type PageGlosses = Record<string, ContextGloss[]>;

const pageCache = new Map<number, Promise<PageGlosses | null>>();

function loadPage(page: number): Promise<PageGlosses | null> {
  if (!pageCache.has(page)) {
    const padded = String(page).padStart(3, '0');
    pageCache.set(
      page,
      fetch(`/glosses/page-${padded}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return pageCache.get(page)!;
}

/** Traductions contextuelles de tous les mots d'un verset (null si non générées). */
export async function getVerseContextGlosses(verseKey: string): Promise<ContextGloss[] | null> {
  const vp = await getVersePageMap();
  const page = vp[verseKey];
  if (!page) return null;
  const data = await loadPage(page);
  return data?.[verseKey] ?? null;
}

/** Traduction contextuelle d'un mot précis (null si non générée). */
export async function getContextGloss(verseKey: string, position: number): Promise<ContextGloss | null> {
  const list = await getVerseContextGlosses(verseKey);
  const hit = list?.find((w) => w.p === position);
  return hit && hit.g ? hit : null;
}

// ---- Traduction d'un mot pour la bulle de la Lecture ----


const wordCache = new Map<string, Promise<{ text: string; note: string; contextual: boolean } | null>>();

/**
 * Traduction d'UN mot (bulle « Affichage trad ») : la traduction en contexte
 * pré-générée d'abord (hors ligne), sinon le mot-à-mot Quran.com traduit (en
 * ligne). Mise en cache mémoire par occurrence.
 */
export function getWordTranslation(
  verseKey: string,
  position: number
): Promise<{ text: string; note: string; contextual: boolean } | null> {
  const key = `${verseKey}:${position}`;
  if (!wordCache.has(key)) {
    wordCache.set(
      key,
      (async () => {
        const ctx = await getContextGloss(verseKey, position).catch(() => null);
        if (ctx) return { text: ctx.g, note: ctx.n, contextual: true };
        try {
          const r = await fetch(apiUrl('/api/word-glosses'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ verseKey, position }] }),
          });
          const data = await r.json();
          const text = data?.glosses?.[key];
          return text ? { text, note: '', contextual: false } : null;
        } catch {
          wordCache.delete(key); // réessayable une fois en ligne
          return null;
        }
      })()
    );
  }
  return wordCache.get(key)!;
}
