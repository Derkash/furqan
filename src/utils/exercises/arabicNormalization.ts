// Normalisation du texte arabe pour comparer la récitation reconnue (Web Speech API)
// au texte du verset (édition quran-simple). On retire les diacritiques et on unifie
// les lettres que la reconnaissance vocale confond systématiquement.

// Harakat, signes coraniques (sajda, marques de pause…), alif suscrit, tatweel.
const ARABIC_MARKS =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;

/** Normalise un mot arabe : sans diacritiques, lettres unifiées, uniquement des lettres. */
export function normalizeArabicWord(word: string): string {
  return word
    .normalize('NFC')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/[^ء-ي]/g, '');
}

/** Découpe un texte en mots (affichage + forme normalisée), en ignorant les
 *  tokens purement diacritiques (ex. les marques de pause isolées). */
export function splitArabicWords(text: string): { display: string; norm: string }[] {
  return text
    .split(/\s+/)
    .map((token) => ({ display: token, norm: normalizeArabicWord(token) }))
    .filter((w) => w.norm.length > 0);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Deux mots normalisés sont-ils « le même mot » (tolérance selon la longueur) ? */
export function wordsSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  const tolerance = len >= 7 ? 2 : len >= 4 ? 1 : 0;
  if (tolerance === 0) return false;
  if (Math.abs(a.length - b.length) > tolerance) return false;
  return levenshtein(a, b) <= tolerance;
}
