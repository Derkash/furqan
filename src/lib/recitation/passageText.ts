// Texte arabe UNICODE du début d'un verset — pour le widget et l'écran
// verrouillé, où les polices QCF (glyphes propres à chaque page, en woff2)
// ne peuvent pas être utilisées.
//
// Source : /mushaf-layout/page-XXX.json, champ `word` — le texte coranique
// othmanien avec ses diacritiques, déjà employé par l'app (usePageVerses).
// Rien n'est régénéré ni reconstitué : ce sont les mots du mushaf, seulement
// dans leur représentation Unicode au lieu des glyphes de la page.

interface LayoutWord {
  location: string; // "sourate:verset:mot"
  word: string;     // texte othmanien
}
interface LayoutLine {
  type: string;
  words?: LayoutWord[];
}

const cache = new Map<number, { first: string; last: string }>();
const pending = new Map<number, Promise<{ first: string; last: string } | null>>();

/** Retire le numéro de verset collé au dernier mot (ex. « ٱلْمُفْلِحُونَ ٥ »). */
function stripAyahNumber(word: string): string {
  return word.replace(/[٠-٩۰-۹\s]+$/u, '').trim();
}

/**
 * Début (n premiers mots) du PREMIER et du DERNIER verset d'une page.
 * Le début identifie le verset — c'est ce qu'on veut lire d'un coup d'œil,
 * pour savoir où commencer comme pour reconnaître où s'arrêter.
 */
async function loadPage(page: number, words: number): Promise<{ first: string; last: string } | null> {
  const cached = cache.get(page);
  if (cached) return cached;
  const inflight = pending.get(page);
  if (inflight) return inflight;

  const padded = String(page).padStart(3, '0');
  const promise = fetch(`/mushaf-layout/page-${padded}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { lines: LayoutLine[] } | null) => {
      if (!data) return null;
      const byVerse = new Map<string, string[]>();
      const order: string[] = [];
      for (const line of data.lines) {
        if (line.type !== 'text' || !line.words) continue;
        for (const w of line.words) {
          const [s, v] = w.location.split(':');
          const key = `${s}:${v}`;
          if (!byVerse.has(key)) {
            byVerse.set(key, []);
            order.push(key);
          }
          byVerse.get(key)!.push(w.word);
        }
      }
      if (!order.length) return null;
      const head = (key: string) => {
        const list = (byVerse.get(key) ?? []).map(stripAyahNumber).filter(Boolean);
        const shown = list.slice(0, words).join(' ');
        return list.length > words ? `${shown} …` : shown;
      };
      const result = { first: head(order[0]), last: head(order[order.length - 1]) };
      cache.set(page, result);
      return result;
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(page);
    });

  pending.set(page, promise);
  return promise;
}

/** Début du premier verset de `firstPage` et du dernier verset de `lastPage`. */
export async function passageHeads(
  firstPage: number,
  lastPage: number,
  words = 4
): Promise<{ start: string; end: string }> {
  const [a, b] = await Promise.all([loadPage(firstPage, words), loadPage(lastPage, words)]);
  return { start: a?.first ?? '', end: b?.last ?? '' };
}
