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
import { hydrateVocab } from '@/utils/vocab/vocabSync';

/**
 * Événement par mot : 'faute' (difficulté déclarée) ou 'ok' (mot récité sans
 * faute → la difficulté diminue). Les anciens types historisés
 * ('oubli' | 'inversion' | 'harakat' | 'mot') sont relus comme 'faute'.
 */
export type WordEventType = 'faute' | 'ok';

export interface WordMistake {
  verseKey: string; // "4:124"
  position: number; // index du mot dans le verset (données QCF)
  page: number;
  type: string; // WordEventType (ou ancien type de faute, relu comme 'faute')
  at: string; // ISO date
}

/** Niveaux visuels de difficulté (1 → 4), du plus léger au plus alarmant. */
export const DIFFICULTY_LEVEL_META: { level: 1 | 2 | 3 | 4; label: string; color: string }[] = [
  { level: 1, label: 'Légère', color: '#d9b64e' },
  { level: 2, label: 'Répétée', color: '#d97706' },
  { level: 3, label: 'Fréquente', color: '#ea580c' },
  { level: 4, label: 'Récurrente', color: '#dc2626' },
];

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

// ---------- Session (cookie + localStorage) ----------
// La WebView iOS (Capacitor) perd parfois les cookies document.cookie d'une
// navigation ou d'une relance à l'autre → la connexion « sautait ». Le
// localStorage, lui, est fiable : on écrit les DEUX et on lit l'un OU l'autre
// (en reposant le cookie s'il s'est évaporé).

const SESSION_KEY = 'almuraja3a:session-user';

export function getCurrentUser(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (match) return decodeURIComponent(match[1]);
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (stored) {
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(stored)}; path=/; max-age=31536000`;
      return stored;
    }
  } catch {
    /* stockage indisponible */
  }
  return null;
}

function setUserCookie(username: string | null) {
  if (typeof document === 'undefined') return;
  if (username === null) {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {}
  } else {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(username)}; path=/; max-age=31536000`;
    try {
      window.localStorage.setItem(SESSION_KEY, username);
    } catch {}
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

/** Hydrate le cache local (stats + réglages + vocabulaire) depuis Supabase après connexion. */
async function hydrateFromRemote(username: string): Promise<void> {
  const [stats, setups] = await Promise.all([
    fetchStats(username),
    fetchSetups(username),
    hydrateVocab(username), // vocabulaire par compte (fusion distant/local)
  ]);
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

/**
 * SUPPRESSION DE COMPTE (App Store 5.1.1(v) : obligatoire dès qu'une app
 * permet de créer un compte). Vérifie le mot de passe, efface toutes les
 * données locales du compte, puis supprime le compte distant (best-effort —
 * la RPC app_delete_account exige le même hash que app_login).
 */
export async function deleteAccount(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const creds = validateCredentials(username, password);
  if ('error' in creds) return { ok: false, error: creds.error };

  // Le compte local stocke directement le hash du mot de passe (cf. register).
  const raw = isBrowser() ? window.localStorage.getItem(creds.key) : null;
  if (!raw) return { ok: false, error: 'Compte introuvable sur cet appareil' };
  if (raw !== creds.hash) return { ok: false, error: 'Mot de passe incorrect' };

  // Distant d'abord (best-effort : hors ligne, la suppression locale suffit
  // et le compte distant sera orphelin mais inaccessible sans le mot de passe).
  try {
    const { deleteAccountRemote } = await import('./progressSync');
    await deleteAccountRemote(creds.name, creds.hash);
  } catch {
    /* hors ligne / Supabase absent */
  }

  // Purge locale : compte, stats, vocabulaire, drapeaux et sauvegardes.
  if (isBrowser()) {
    const user = creds.name;
    const prefixes = [
      `almuraja3a:vocab:${user}`,
      `almuraja3a:vocab-seeded:${user}`,
      `almuraja3a:vocab-anchor-mig:${user}`,
      `almuraja3a:vocab-backup:${user}:`,
    ];
    window.localStorage.removeItem(creds.key);
    window.localStorage.removeItem(STATS_PREFIX + user);
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && prefixes.some((p) => k === p || k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  }
  setUserCookie(null);
  return { ok: true };
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

  for (const m of stats.wordMistakes) bump(m.verseKey, m.page, m.type === 'ok' ? -1 : 2);
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

// ---------- Score de difficulté par mot (glissant, borné) ----------
//
// Chaque mot a un score évolutif rejoué depuis son historique chronologique :
// faute → +1, récitation correcte ('ok') → −1, borné à [0, DIFFICULTY_MAX].
// Le score est donc « glissant » : les récitations récentes l'emportent sur
// l'accumulation ancienne (5 fautes → rouge, puis 5 récitations correctes →
// retour au normal, en repassant par orange et teinte légère).

export const DIFFICULTY_MAX = 5;

export interface WordDifficulty {
  verseKey: string;
  position: number;
  page: number;
  /** Score glissant borné [0, DIFFICULTY_MAX]. */
  score: number;
  /** Niveau visuel : 0 normal, 1 légère, 2 répétée, 3 fréquente, 4 récurrente. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Nombre total de fautes historisées (info tableau de bord). */
  faults: number;
  lastAt: string;
}

/** Niveau visuel à partir du score glissant. */
export function difficultyLevel(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score <= 0) return 0;
  if (score >= 4) return 4;
  return Math.ceil(score) as 1 | 2 | 3;
}

/**
 * Difficulté courante de chaque mot ("verseKey#position") : historique rejoué
 * dans l'ordre chronologique. Les mots revenus à 0 sans faute historisée
 * n'apparaissent pas.
 */
export function getWordDifficulties(username: string | null): Map<string, WordDifficulty> {
  const map = new Map<string, WordDifficulty>();
  if (!username) return map;
  const events = [...loadStats(username).wordMistakes].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0
  );
  for (const m of events) {
    const key = `${m.verseKey}#${m.position}`;
    const entry = map.get(key) ?? {
      verseKey: m.verseKey,
      position: m.position,
      page: m.page,
      score: 0,
      level: 0 as const,
      faults: 0,
      lastAt: m.at,
    };
    if (m.type === 'ok') {
      entry.score = Math.max(0, entry.score - 1);
    } else {
      entry.score = Math.min(DIFFICULTY_MAX, entry.score + 1);
      entry.faults++;
    }
    entry.level = difficultyLevel(entry.score);
    if (m.at > entry.lastAt) entry.lastAt = m.at;
    map.set(key, entry);
  }
  return map;
}

/**
 * Marques "verseKey#position" → 'diff-1' … 'diff-4' pour l'affichage sur la
 * page (Hifz, Lecture, Récitation) : l'intensité suit le niveau de difficulté.
 */
export function getWordDifficultyMarks(username: string | null): Map<string, string> {
  const marks = new Map<string, string>();
  for (const [key, d] of getWordDifficulties(username)) {
    if (d.level > 0) marks.set(key, `diff-${d.level}`);
  }
  return marks;
}

/**
 * Crédite une récitation correcte : pour chaque mot EN DIFFICULTÉ (score > 0)
 * appartenant à un verset réellement récité, enregistre un événement 'ok'
 * (score −1). Les mots sans difficulté connue ne génèrent aucun événement
 * (rien à diminuer), et `excludeKeys` protège les mots dont la faute vient
 * d'être déclarée dans la même passe. Retourne le nombre de mots crédités.
 */
export function creditRecitedVerses(
  username: string | null,
  verseKeys: Iterable<string>,
  excludeKeys?: Set<string>
): number {
  if (!username) return 0;
  const recited = new Set(verseKeys);
  if (recited.size === 0) return 0;
  const at = new Date().toISOString();
  const events: WordMistake[] = [];
  for (const [key, d] of getWordDifficulties(username)) {
    if (d.score <= 0 || !recited.has(d.verseKey)) continue;
    if (excludeKeys?.has(key)) continue;
    events.push({ verseKey: d.verseKey, position: d.position, page: d.page, type: 'ok', at });
  }
  recordWordMistakes(username, events);
  return events.length;
}

/** Mots en difficulté (score > 0) pour le tableau de bord, triés par score. */
export function aggregateWordDifficulties(username: string | null): WordDifficulty[] {
  return Array.from(getWordDifficulties(username).values())
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || b.faults - a.faults);
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
