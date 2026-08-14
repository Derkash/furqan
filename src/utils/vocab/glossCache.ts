// Cache LOCAL (offline) des données lexicales coûteuses à recalculer :
//   - analyse d'un mot (vocab-analyze) : baseForm, gloss, nahw…
//   - traduction contextuelle d'une occurrence (occurrence-info) : gloss, note.
// But : une info vue UNE FOIS en ligne reste disponible HORS LIGNE ensuite.
// Stockage : un objet JSON par famille dans localStorage, plafonné (les entrées
// les plus anciennes sont évincées quand on dépasse la capacité).

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

interface Timed<T> {
  v: T;
  t: number;
}

function readMap<T>(key: string): Record<string, Timed<T>> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, map: Record<string, Timed<T>>, cap: number): void {
  if (!isBrowser()) return;
  const keys = Object.keys(map);
  if (keys.length > cap) {
    keys.sort((a, b) => map[a].t - map[b].t); // plus anciens en tête
    for (const k of keys.slice(0, keys.length - cap)) delete map[k];
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota — silencieux */
  }
}

const ANALYZE_KEY = 'almuraja3a:cache:wordanalyze:v1';
const OCC_KEY = 'almuraja3a:cache:occinfo:v2'; // v2 : ajout de frSpan
const CAP = 4000;

// ---- Analyse d'un mot (WordCard hors lexique) ----

export interface WordAnalysisCache {
  baseForm?: string;
  baseFormType?: string;
  frenchGloss?: string;
  nahw?: string;
}

export function getCachedAnalysis(k: string): WordAnalysisCache | null {
  return readMap<WordAnalysisCache>(ANALYZE_KEY)[k]?.v ?? null;
}

export function setCachedAnalysis(k: string, v: WordAnalysisCache): void {
  const m = readMap<WordAnalysisCache>(ANALYZE_KEY);
  m[k] = { v, t: Date.now() };
  writeMap(ANALYZE_KEY, m, CAP);
}

// ---- Traduction contextuelle d'une occurrence (OccurrencesExplorer) ----

export interface OccInfoCache {
  gloss: string;
  frSpan: string; // portion exacte de la traduction FR qui rend le mot (à surligner)
  note: string;
}

export function getCachedOccInfo(k: string): OccInfoCache | null {
  return readMap<OccInfoCache>(OCC_KEY)[k]?.v ?? null;
}

export function setCachedOccInfoBulk(entries: Record<string, OccInfoCache>): void {
  if (!Object.keys(entries).length) return;
  const m = readMap<OccInfoCache>(OCC_KEY);
  const t = Date.now();
  for (const [k, v] of Object.entries(entries)) m[k] = { v, t };
  writeMap(OCC_KEY, m, CAP);
}
