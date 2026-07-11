// Comptes simples (identifiant + mot de passe, création automatique) et
// mémoire des fautes de récitation / résultats de quiz.
// Stockage : localStorage (cache local, lectures synchrones) synchronisé avec
// Supabase (sauvegarde + partage entre appareils) quand il est configuré.
// Session : cookie (1 an). Volontairement simple — outil personnel.

import {
  registerRemote,
  loginRemote,
  fetchStats,
  fetchSetups,
  pushWordMistakes,
  pushVerseResult,
} from './progressSync';
import { hydrateSetupsLocal } from './exerciseMemory';

export type MistakeType = 'oubli' | 'inversion' | 'harakat' | 'mot';

/** Types de faute avec libellé et couleur (mêmes teintes que les marques sur la page). */
export const MISTAKE_TYPE_META: { value: MistakeType; label: string; color: string }[] = [
  { value: 'oubli', label: 'Oubli', color: '#d97706' },
  { value: 'inversion', label: 'Inversion', color: '#7c3aed' },
  { value: 'harakat', label: 'Harakat', color: '#2563eb' },
  { value: 'mot', label: 'Mot erroné', color: '#dc2626' },
];

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

function validateCredentials(
  username: string,
  password: string
): { name: string; key: string; hash: string } | { error: string } {
  if (!isBrowser()) return { error: 'Stockage indisponible' };
  const name = username.trim();
  if (!name) return { error: 'Identifiant requis' };
  if (!password) return { error: 'Mot de passe requis' };
  return {
    name,
    key: ACCOUNT_PREFIX + name.toLowerCase(),
    hash: hashPassword(password),
  };
}

/** Hydrate le cache local (stats + réglages) depuis Supabase après connexion. */
async function hydrateFromRemote(username: string): Promise<void> {
  const [stats, setups] = await Promise.all([fetchStats(username), fetchSetups(username)]);
  if (stats) saveStats(username, stats);
  if (setups) hydrateSetupsLocal(setups);
}

/**
 * Connexion : l'identifiant doit exister et le mot de passe correspondre.
 * Si Supabase est configuré, il fait autorité (et on hydrate le cache local) ;
 * sinon on retombe sur la vérification localStorage (mode hors-ligne).
 */
export async function login(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const creds = validateCredentials(username, password);
  if ('error' in creds) return { ok: false, error: creds.error };

  const remote = await loginRemote(creds.name, creds.hash);
  if (remote) {
    if (!remote.ok) return remote;
    // Cache local (permet lecture synchrone + connexion hors-ligne ultérieure).
    window.localStorage.setItem(creds.key, creds.hash);
    setUserCookie(creds.name);
    await hydrateFromRemote(creds.name);
    return { ok: true };
  }

  // Fallback local (Supabase absent ou injoignable).
  const existing = window.localStorage.getItem(creds.key);
  if (existing === null) {
    return { ok: false, error: 'Cet identifiant n’existe pas. Créez un compte.' };
  }
  if (existing !== creds.hash) {
    return { ok: false, error: 'Mot de passe incorrect' };
  }
  setUserCookie(creds.name);
  return { ok: true };
}

/** Inscription : l'identifiant ne doit pas déjà exister. */
export async function register(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const creds = validateCredentials(username, password);
  if ('error' in creds) return { ok: false, error: creds.error };

  const remote = await registerRemote(creds.name, creds.hash);
  if (remote) {
    if (!remote.ok) return remote;
    window.localStorage.setItem(creds.key, creds.hash);
    setUserCookie(creds.name);
    return { ok: true };
  }

  // Fallback local (Supabase absent ou injoignable).
  if (window.localStorage.getItem(creds.key) !== null) {
    return { ok: false, error: 'Cet identifiant existe déjà. Connectez-vous.' };
  }
  window.localStorage.setItem(creds.key, creds.hash);
  setUserCookie(creds.name);
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
  pushWordMistakes(username, mistakes); // sync Supabase en arrière-plan
}

export function recordVerseResult(username: string | null, result: VerseResult) {
  if (!username) return;
  const stats = loadStats(username);
  stats.verseResults.push(result);
  saveStats(username, stats);
  pushVerseResult(username, result); // sync Supabase en arrière-plan
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

/**
 * Marques "verseKey#position" → type de faute, pour l'affichage coloré
 * (Récitation et Hifz). En cas de types multiples : le plus récent gagne.
 */
export function getMistakeWordMarks(username: string | null): Map<string, MistakeType> {
  const marks = new Map<string, MistakeType>();
  if (!username) return marks;
  // wordMistakes est chronologique : la dernière écriture l'emporte.
  for (const m of loadStats(username).wordMistakes) {
    marks.set(`${m.verseKey}#${m.position}`, m.type);
  }
  return marks;
}

export interface AggregatedMistake {
  verseKey: string;
  position: number;
  page: number;
  count: number;
  types: Partial<Record<MistakeType, number>>;
  lastAt: string;
}

/** Fautes agrégées par mot (pour le tableau de bord), triées par fréquence. */
export function aggregateMistakesByWord(username: string | null): AggregatedMistake[] {
  const map = new Map<string, AggregatedMistake>();
  if (!username) return [];
  for (const m of loadStats(username).wordMistakes) {
    const key = `${m.verseKey}#${m.position}`;
    const entry = map.get(key) ?? {
      verseKey: m.verseKey,
      position: m.position,
      page: m.page,
      count: 0,
      types: {},
      lastAt: m.at,
    };
    entry.count++;
    entry.types[m.type] = (entry.types[m.type] ?? 0) + 1;
    if (m.at > entry.lastAt) entry.lastAt = m.at;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
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
