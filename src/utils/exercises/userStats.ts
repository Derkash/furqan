// Comptes simples (identifiant + mot de passe, création automatique) et
// mémoire des fautes de récitation / résultats de quiz.
// Stockage : localStorage (par appareil) ; session : cookie (1 an).
// Volontairement simple — pas de vraie sécurité, c'est un outil personnel.

export type MistakeType = 'oubli' | 'inversion' | 'harakat' | 'mot';

export interface WordMistake {
  verseKey: string; // "4:124"
  position: number; // index du mot dans le verset (données QCF)
  page: number;
  type: MistakeType;
  at: string; // ISO date
}

export interface VerseResult {
  verseKey: string;
  page: number;
  found: boolean;
  exercise: string;
  at: string;
}

export interface UserStats {
  wordMistakes: WordMistake[];
  verseResults: VerseResult[];
}

const COOKIE_NAME = 'almuraja3a_user';
const ACCOUNT_PREFIX = 'almuraja3a:account:';
const STATS_PREFIX = 'almuraja3a:stats:';
/** Borne le stockage : on garde les entrées les plus récentes. */
const MAX_ENTRIES = 2000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

// Hash volontairement simple (djb2) — suffit pour distinguer les profils.
function hashPassword(password: string): string {
  let h = 5381;
  for (let i = 0; i < password.length; i++) {
    h = ((h * 33) ^ password.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ---------- Session (cookie) ----------

export function getCurrentUser(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setUserCookie(username: string | null) {
  if (typeof document === 'undefined') return;
  if (username === null) {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  } else {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(username)}; path=/; max-age=31536000`;
  }
}

// ---------- Comptes ----------

/**
 * Connexion : crée le compte automatiquement s'il n'existe pas.
 * Retourne une erreur uniquement si le mot de passe ne correspond pas.
 */
export function login(
  username: string,
  password: string
): { ok: boolean; error?: string } {
  if (!isBrowser()) return { ok: false, error: 'Stockage indisponible' };
  const name = username.trim();
  if (!name) return { ok: false, error: 'Identifiant requis' };
  if (!password) return { ok: false, error: 'Mot de passe requis' };

  const key = ACCOUNT_PREFIX + name.toLowerCase();
  const hash = hashPassword(password);
  const existing = window.localStorage.getItem(key);
  if (existing === null) {
    window.localStorage.setItem(key, hash);
  } else if (existing !== hash) {
    return { ok: false, error: 'Mot de passe incorrect' };
  }
  setUserCookie(name);
  return { ok: true };
}

export function logout() {
  setUserCookie(null);
}

// ---------- Statistiques ----------

const EMPTY_STATS: UserStats = { wordMistakes: [], verseResults: [] };

export function loadStats(username: string | null): UserStats {
  if (!isBrowser() || !username) return EMPTY_STATS;
  try {
    const raw = window.localStorage.getItem(STATS_PREFIX + username.toLowerCase());
    if (!raw) return EMPTY_STATS;
    const parsed = JSON.parse(raw) as UserStats;
    return {
      wordMistakes: Array.isArray(parsed.wordMistakes) ? parsed.wordMistakes : [],
      verseResults: Array.isArray(parsed.verseResults) ? parsed.verseResults : [],
    };
  } catch {
    return EMPTY_STATS;
  }
}

function saveStats(username: string, stats: UserStats) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STATS_PREFIX + username.toLowerCase(),
      JSON.stringify({
        wordMistakes: stats.wordMistakes.slice(-MAX_ENTRIES),
        verseResults: stats.verseResults.slice(-MAX_ENTRIES),
      })
    );
  } catch {
    // Quota plein : on ignore.
  }
}

export function recordWordMistakes(username: string | null, mistakes: WordMistake[]) {
  if (!username || mistakes.length === 0) return;
  const stats = loadStats(username);
  stats.wordMistakes.push(...mistakes);
  saveStats(username, stats);
}

export function recordVerseResult(username: string | null, result: VerseResult) {
  if (!username) return;
  const stats = loadStats(username);
  stats.verseResults.push(result);
  saveStats(username, stats);
}

// ---------- Priorités pour les quiz adaptatifs ----------

/**
 * Versets « à retravailler » dans une plage de pages : versets contenant des
 * mots déclarés en faute + versets non trouvés au quiz, pondérés par le nombre
 * d'occurrences (une faute répétée pèse plus lourd). Un verset trouvé ensuite
 * au quiz réduit son poids.
 */
export function getPriorityVerses(
  username: string | null,
  startPage: number,
  endPage: number
): Map<string, { page: number; weight: number }> {
  const result = new Map<string, { page: number; weight: number }>();
  if (!username) return result;
  const stats = loadStats(username);

  const bump = (verseKey: string, page: number, delta: number) => {
    if (page < startPage || page > endPage) return;
    const cur = result.get(verseKey) ?? { page, weight: 0 };
    cur.weight = Math.max(0, cur.weight + delta);
    result.set(verseKey, cur);
  };

  for (const m of stats.wordMistakes) bump(m.verseKey, m.page, 2);
  for (const r of stats.verseResults) bump(r.verseKey, r.page, r.found ? -1 : 2);

  for (const [key, value] of result) {
    if (value.weight <= 0) result.delete(key);
  }
  return result;
}

/** Pages contenant au moins un verset prioritaire dans la plage. */
export function getPriorityPages(
  username: string | null,
  startPage: number,
  endPage: number
): Set<number> {
  const pages = new Set<number>();
  for (const { page } of getPriorityVerses(username, startPage, endPage).values()) {
    pages.add(page);
  }
  return pages;
}

/** Tire un verset prioritaire au hasard, pondéré par le poids. */
export function pickPriorityVerse(
  priorities: Map<string, { page: number; weight: number }>
): { verseKey: string; page: number } | null {
  let total = 0;
  for (const { weight } of priorities.values()) total += weight;
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [verseKey, { page, weight }] of priorities) {
    r -= weight;
    if (r <= 0) return { verseKey, page };
  }
  return null;
}
