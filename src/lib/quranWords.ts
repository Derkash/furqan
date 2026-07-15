// Glose mot-à-mot du Coran (serveur) : anglais de Quran.com → français via Bing.
// Gratuit, mis en cache mémoire. Partagé par les routes vocab.
import { translate as bingTranslate } from 'bing-translate-api';

const verseWordsCache = new Map<string, { position: number; en: string }[]>();
const translateCache = new Map<string, string>();

/** Mot-à-mot anglais d'un verset (Quran.com), mis en cache. Avec 1 réessai. */
export async function getVerseWordsEn(
  verseKey: string
): Promise<{ position: number; en: string }[]> {
  if (verseWordsCache.has(verseKey)) return verseWordsCache.get(verseKey)!;
  const url = `https://api.quran.com/api/v4/verses/by_key/${verseKey}?words=true&word_translation_language=en`;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'almuraja3a/1.0 (+https://almuraja3a.com)',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`quran.com ${res.status}`);
      const data = await res.json();
      const words = (data?.verse?.words ?? [])
        .filter((w: { char_type_name?: string }) => w.char_type_name === 'word')
        .map((w: { position: number; translation?: { text?: string } }) => ({
          position: w.position,
          en: w.translation?.text ?? '',
        }));
      verseWordsCache.set(verseKey, words);
      return words;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('quran.com indisponible');
}

/** Traduit EN→FR via Bing, avec cache. '' en cas d'échec. */
export async function toFrench(en: string): Promise<string> {
  const clean = en.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (translateCache.has(clean)) return translateCache.get(clean)!;
  try {
    const r = await bingTranslate(clean, 'en', 'fr');
    const fr = r?.translation?.trim() ?? '';
    translateCache.set(clean, fr);
    return fr;
  } catch {
    return '';
  }
}

/** Glose française d'un mot précis (verseKey + position). */
export async function frenchWordGloss(verseKey: string, position: number): Promise<string> {
  try {
    const words = await getVerseWordsEn(verseKey);
    const w = words.find((x) => x.position === position);
    return w?.en ? await toFrench(w.en) : '';
  } catch {
    return '';
  }
}
