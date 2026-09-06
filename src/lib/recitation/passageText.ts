// Texte arabe UNICODE des débuts de versets — pour le widget, l'écran
// verrouillé et les repères de navigation, où les polices QCF (glyphes
// propres à chaque page, en woff2) ne sont pas utilisables ou trop lourdes.
//
// Source : /mushaf-layout/page-XXX.json, champ `word` — le texte coranique
// othmanien avec ses diacritiques, déjà employé par l'app (usePageVerses).
// Rien n'est régénéré ni reconstitué : ce sont les mots du mushaf, seulement
// dans leur représentation Unicode au lieu des glyphes de la page.
//
// Le cache stocke les LISTES DE MOTS complètes (pas un texte tronqué) : la
// même page peut être demandée avec des longueurs différentes (widget : 4
// mots, parcours : 6, grand widget : 14) sans jamais refaire le fetch.

interface LayoutWord {
  location: string; // "sourate:verset:mot"
  word: string;     // texte othmanien
}
interface LayoutLine {
  type: string;
  words?: LayoutWord[];
}

interface PageVerseWords {
  /** Mots du premier verset présent sur la page. */
  first: string[];
  /** Mots du dernier verset présent sur la page. */
  last: string[];
}

const cache = new Map<number, PageVerseWords>();
const pending = new Map<number, Promise<PageVerseWords | null>>();

/** Retire le numéro de verset collé au dernier mot (ex. « ٱلْمُفْلِحُونَ ٥ »). */
function stripAyahNumber(word: string): string {
  return word.replace(/[٠-٩۰-۹\s]+$/u, '').trim();
}

function loadPage(page: number): Promise<PageVerseWords | null> {
  const cached = cache.get(page);
  if (cached) return Promise.resolve(cached);
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
          byVerse.get(key)!.push(stripAyahNumber(w.word));
        }
      }
      if (!order.length) return null;
      const clean = (key: string) => (byVerse.get(key) ?? []).filter(Boolean);
      const result: PageVerseWords = {
        first: clean(order[0]),
        last: clean(order[order.length - 1]),
      };
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

function head(words: string[] | undefined, count: number): string {
  if (!words?.length) return '';
  const shown = words.slice(0, count).join(' ');
  return words.length > count ? `${shown} …` : shown;
}

/** Début du premier verset d'UNE page (repère de navigation). */
export async function pageFirstVerseHead(page: number, words = 6): Promise<string> {
  const data = await loadPage(page);
  return head(data?.first, words);
}

/** Début du premier verset de `firstPage` et du dernier verset de `lastPage`. */
export async function passageHeads(
  firstPage: number,
  lastPage: number,
  words = 4
): Promise<{ start: string; end: string }> {
  const [a, b] = await Promise.all([loadPage(firstPage), loadPage(lastPage)]);
  return { start: head(a?.first, words), end: head(b?.last, words) };
}
