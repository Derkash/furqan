// Vocabulaire personnel : liste de mots à mémoriser, stockée dans localStorage
// (par utilisateur). Chaque mot est ancré sur sa RACINE (anti-doublon) ; à
// défaut de racine, sur sa forme « nue ». Révision espacée façon Leitner.
//
// Note : stockage local pour l'instant (comme l'était le suivi de progression à
// ses débuts). La synchronisation Supabase pourra être ajoutée ensuite.

import { getCurrentUser } from '@/utils/exercises/userStats';
import { pushVocabEntry, deleteVocabRemote, pushVocabBulk } from './vocabSync';

export interface VocabEntry {
  id: string; // ancre : "r:<racine>" ou "f:<forme nue>"
  arabic: string; // forme de base (ou fléchie) affichée, vocalisée
  gloss: string; // traduction française
  root?: string;
  lemma?: string;
  baseForm?: string; // forme de base proposée par l'analyse
  baseFormType?: string; // verbe / nom / maṣdar / …
  nahw?: string; // explication grammaticale (analyse d'une occurrence)
  sampleVerseKey?: string; // verset où le mot a été capturé
  source: 'seed' | 'mushaf' | 'manual';
  addedAt: string;
  // Révision espacée (Leitner) : boîte 0..5, montée si correct.
  box: number;
  lastReviewed?: string;
  seen: number;
  correct: number;
}

const PREFIX = 'almuraja3a:vocab:';
const SEEDED_PREFIX = 'almuraja3a:vocab-seeded:';
// Version du seed : bump → resynchronise les formes affichées (baseForm…) des
// entrées « seed » existantes, SANS toucher à la progression Leitner.
const SEED_VERSION = '5';
// Migration des ancres racine → lemme (une fois par utilisateur).
const ANCHOR_MIG_PREFIX = 'almuraja3a:vocab-anchor-mig:';
const ANCHOR_MIG_VERSION = '1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function userKey(): string {
  return getCurrentUser() || 'guest';
}

/** Forme « nue » : sans harakat/shadda/tanwin, hamza/alef normalisés. */
export function bareForm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ً-ْٰـۖ-ۭ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

/**
 * Ancre (identité) d'un mot de vocabulaire.
 *
 * L'unité de mémorisation est le LEMME (mot de dictionnaire), pas la racine :
 * une même racine couvre souvent des lexèmes de sens différents
 * (ح‑ج‑ر → حَجَر « pierre », حِجْر « giron/tutelle », حُجُرَة « chambre » ;
 *  ك‑ل‑ل → كُلّ « tout » vs كَلالَة « sans héritier »). Ancrer sur la racine
 * fusionnerait ces mots à tort. On retombe sur la racine puis sur la forme nue
 * uniquement quand le lemme est absent.
 */
export function anchorOf(
  lemma: string | undefined,
  root: string | undefined,
  arabic: string
): string {
  if (lemma) return `l:${lemma.normalize('NFC')}`;
  if (root) return `r:${root}`;
  return `f:${bareForm(arabic)}`;
}

// ---- Correspondance mot ↔ lexique (surlignage du Mushaf) ----

export interface LexiconMatch {
  lemmas: Set<string>; // lemmes des entrées qui en ont un
  roots: Set<string>; // racines des entrées SANS lemme (fallback historique)
  forms: Set<string>; // formes nues des entrées sans lemme ni racine
}

/** Construit les ensembles de correspondance à partir du lexique courant. */
export function lexiconMatchSets(): LexiconMatch {
  const lemmas = new Set<string>();
  const roots = new Set<string>();
  const forms = new Set<string>();
  for (const e of getVocab()) {
    if (e.lemma) lemmas.add(e.lemma.normalize('NFC'));
    else if (e.root) roots.add(e.root);
    else forms.add(bareForm(e.arabic));
  }
  return { lemmas, roots, forms };
}

/**
 * Vrai si un mot du Mushaf correspond à une entrée du lexique. On compare par
 * LEMME en priorité (jamais par racine quand le lemme est connu) → deux lexèmes
 * d'une même racine ne se surlignent pas l'un l'autre.
 */
export function matchesLexicon(
  sets: LexiconMatch,
  word: { lemma?: string; root?: string; form?: string }
): boolean {
  if (word.lemma && sets.lemmas.has(word.lemma.normalize('NFC'))) return true;
  // Fallback racine : uniquement pour les entrées sans lemme.
  if (word.root && sets.roots.has(word.root)) return true;
  if (word.form && sets.forms.has(bareForm(word.form))) return true;
  return false;
}

// ---- Lecture / écriture ----

export function getVocab(): VocabEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + userKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeVocab(list: VocabEntry[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PREFIX + userKey(), JSON.stringify(list));
  } catch {
    /* quota — silencieux */
  }
}

/** Remplace la liste locale (utilisé par l'hydratation Supabase). */
export function setVocabList(list: VocabEntry[]): void {
  writeVocab(list);
}

export interface AddInput {
  arabic: string;
  gloss: string;
  root?: string;
  lemma?: string;
  baseForm?: string;
  baseFormType?: string;
  nahw?: string;
  sampleVerseKey?: string;
  source?: VocabEntry['source'];
}

export type AddResult =
  | { status: 'added'; entry: VocabEntry }
  | { status: 'duplicate'; entry: VocabEntry };

/** Ajoute un mot. Si sa racine (ou sa forme) existe déjà → "duplicate". */
export function addVocab(input: AddInput): AddResult {
  const list = getVocab();
  const id = anchorOf(input.lemma, input.root, input.arabic);
  const existing = list.find((e) => e.id === id);
  if (existing) return { status: 'duplicate', entry: existing };

  const entry: VocabEntry = {
    id,
    arabic: input.arabic,
    gloss: input.gloss,
    root: input.root,
    lemma: input.lemma,
    baseForm: input.baseForm,
    baseFormType: input.baseFormType,
    nahw: input.nahw,
    sampleVerseKey: input.sampleVerseKey,
    source: input.source ?? 'mushaf',
    addedAt: new Date().toISOString(),
    box: 0,
    seen: 0,
    correct: 0,
  };
  writeVocab([entry, ...list]);
  pushVocabEntry(getCurrentUser(), entry); // sync Supabase (compte)
  return { status: 'added', entry };
}

/** Vrai si le lemme (ou racine/forme) est déjà dans la liste. */
export function hasVocab(
  lemma: string | undefined,
  root: string | undefined,
  arabic: string
): boolean {
  const id = anchorOf(lemma, root, arabic);
  return getVocab().some((e) => e.id === id);
}

/** L'entrée du lexique pour ce lemme (ou racine/forme), sinon null. */
export function getVocabEntry(
  lemma: string | undefined,
  root: string | undefined,
  arabic: string
): VocabEntry | null {
  const id = anchorOf(lemma, root, arabic);
  return getVocab().find((e) => e.id === id) ?? null;
}

export function updateVocab(id: string, patch: Partial<VocabEntry>): void {
  const list = getVocab().map((e) => (e.id === id ? { ...e, ...patch } : e));
  writeVocab(list);
  const updated = list.find((e) => e.id === id);
  if (updated) pushVocabEntry(getCurrentUser(), updated);
}

export function removeVocab(id: string): void {
  writeVocab(getVocab().filter((e) => e.id !== id));
  deleteVocabRemote(getCurrentUser(), id);
}

// ---- Sauvegarde / restauration ----

const BACKUP_PREFIX = 'almuraja3a:vocab-backup:';

/** Exporte tout le lexique de l'utilisateur courant en JSON (téléchargeable). */
export function exportVocab(): string {
  return JSON.stringify(
    {
      app: 'almuraja3a',
      kind: 'vocab-export',
      version: 1,
      user: userKey(),
      exportedAt: new Date().toISOString(),
      count: getVocab().length,
      entries: getVocab(),
    },
    null,
    2
  );
}

/**
 * Restaure depuis un JSON exporté (ou un tableau d'entrées). Fusionne par défaut :
 * on AJOUTE les mots absents et on GARDE l'existant (aucune perte). Renvoie les
 * compteurs. Lève une erreur si le fichier est illisible / vide.
 */
export function importVocab(text: string): { added: number; kept: number; total: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fichier illisible (JSON invalide).');
  }
  const incoming: VocabEntry[] = Array.isArray(parsed)
    ? (parsed as VocabEntry[])
    : Array.isArray((parsed as { entries?: VocabEntry[] })?.entries)
      ? (parsed as { entries: VocabEntry[] }).entries
      : [];
  if (!incoming.length) throw new Error('Aucun mot trouvé dans le fichier.');

  const current = getVocab();
  const byId = new Map(current.map((e) => [e.id, e] as const));
  const kept = current.length;
  let added = 0;
  for (const e of incoming) {
    if (!e || typeof e.id !== 'string') continue;
    if (!byId.has(e.id)) {
      byId.set(e.id, e);
      added++;
    }
  }
  const merged = [...byId.values()];
  writeVocab(merged);
  return { added, kept, total: merged.length };
}

/**
 * Snapshot local automatique (une par jour, 7 derniers jours conservés). Filet de
 * secours contre une suppression accidentelle dans l'app / une reconstruction du
 * seed — NE protège pas d'un vidage complet du navigateur (→ utiliser l'export).
 */
export function autoLocalBackup(): void {
  if (!isBrowser()) return;
  try {
    const cur = getVocab();
    if (!cur.length) return;
    const prefix = BACKUP_PREFIX + userKey() + ':';
    const stamp = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
    window.localStorage.setItem(prefix + stamp, JSON.stringify(cur));
    const keys = Object.keys(window.localStorage)
      .filter((k) => k.startsWith(prefix))
      .sort();
    while (keys.length > 7) {
      const k = keys.shift();
      if (k) window.localStorage.removeItem(k);
    }
  } catch {
    /* quota — silencieux */
  }
}

// Intervalles Leitner (jours) par boîte 0..5.
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 45];

/** Un mot est « à réviser » s'il n'a jamais été vu ou si son intervalle est écoulé. */
export function isDue(e: VocabEntry, now: number = Date.now()): boolean {
  if (!e.lastReviewed) return true;
  const days = INTERVALS_DAYS[Math.min(e.box, INTERVALS_DAYS.length - 1)];
  return now - new Date(e.lastReviewed).getTime() >= days * 86400000;
}

/** Mots à réviser maintenant, les moins maîtrisés / plus anciens d'abord. */
export function dueVocab(): VocabEntry[] {
  const now = Date.now();
  return getVocab()
    .filter((e) => isDue(e, now))
    .sort(
      (a, b) =>
        a.box - b.box ||
        (a.lastReviewed ? new Date(a.lastReviewed).getTime() : 0) -
          (b.lastReviewed ? new Date(b.lastReviewed).getTime() : 0)
    );
}

/** Enregistre une révision : monte/descend la boîte Leitner. */
export function recordReview(id: string, correct: boolean): void {
  const list = getVocab().map((e) => {
    if (e.id !== id) return e;
    const box = correct ? Math.min(5, e.box + 1) : 0;
    return {
      ...e,
      box,
      seen: e.seen + 1,
      correct: e.correct + (correct ? 1 : 0),
      lastReviewed: new Date().toISOString(),
    };
  });
  writeVocab(list);
  const updated = list.find((e) => e.id === id);
  if (updated) pushVocabEntry(getCurrentUser(), updated);
}

/**
 * Migration : ré-ancre les entrées existantes sur le LEMME (ancienne clé =
 * racine). Idempotente (flag de version par utilisateur), sans perte : en cas
 * de collision (deux entrées retombant sur le même lemme), on fusionne en
 * gardant la meilleure progression Leitner.
 */
export function migrateVocabAnchors(): void {
  if (!isBrowser()) return;
  const flag = ANCHOR_MIG_PREFIX + userKey();
  if (window.localStorage.getItem(flag) === ANCHOR_MIG_VERSION) return;

  const list = getVocab();
  if (!list.length) {
    window.localStorage.setItem(flag, ANCHOR_MIG_VERSION);
    return;
  }
  const byId = new Map<string, VocabEntry>();
  const oldIds = new Set(list.map((e) => e.id));
  let changed = false;
  for (const e of list) {
    const newId = anchorOf(e.lemma, e.root, e.arabic);
    if (newId !== e.id) changed = true;
    const migrated: VocabEntry = { ...e, id: newId };
    const prev = byId.get(newId);
    if (!prev) {
      byId.set(newId, migrated);
    } else {
      // Fusion : on conserve la progression la plus avancée.
      byId.set(newId, {
        ...prev,
        box: Math.max(prev.box, migrated.box),
        seen: Math.max(prev.seen, migrated.seen),
        correct: Math.max(prev.correct, migrated.correct),
        lastReviewed:
          [prev.lastReviewed, migrated.lastReviewed]
            .filter(Boolean)
            .sort()
            .pop() ?? undefined,
        addedAt: [prev.addedAt, migrated.addedAt].filter(Boolean).sort()[0] ?? prev.addedAt,
      });
    }
  }
  if (changed || byId.size !== list.length) {
    const merged = [...byId.values()];
    writeVocab(merged);
    const user = getCurrentUser();
    pushVocabBulk(user, merged);
    // Supprime à distance les anciennes ancres (racine) devenues obsolètes,
    // sinon elles réapparaîtraient sur les autres appareils à l'hydratation.
    for (const oldId of oldIds) {
      if (!byId.has(oldId)) deleteVocabRemote(user, oldId);
    }
  }
  window.localStorage.setItem(flag, ANCHOR_MIG_VERSION);
}

// ---- Seed du lexique personnel ----

interface SeedRow {
  n: number;
  arabic: string;
  french: string;
  root?: string;
  lemma?: string;
  baseForm?: string;
  baseFormType?: string;
}

/**
 * Importe le lexique personnel (public/vocab-seed.json) la 1re fois, si la liste
 * est vide et qu'aucun import n'a encore eu lieu pour cet utilisateur.
 * Renvoie le nombre de mots importés.
 */
export async function seedVocabIfNeeded(): Promise<number> {
  if (!isBrowser()) return 0;
  migrateVocabAnchors(); // ré-ancre l'existant sur le lemme avant toute chose
  const flagKey = SEEDED_PREFIX + userKey();
  // Déjà à la bonne version → rien à faire.
  if (window.localStorage.getItem(flagKey) === SEED_VERSION) return 0;

  try {
    const rows: SeedRow[] = await fetch('/vocab-seed.json').then((r) => r.json());
    const list = getVocab();

    // Reconstruit entièrement les entrées « seed » (les racines/formes ont pu
    // être corrigées → l'ancre change). On CONSERVE la progression Leitner en
    // la reliant par la traduction (gloss), stable d'une version à l'autre.
    const prog = new Map<
      string,
      { box: number; seen: number; correct: number; lastReviewed?: string; addedAt: string }
    >();
    for (const e of list) {
      if (e.source === 'seed') {
        prog.set(e.gloss, {
          box: e.box,
          seen: e.seen,
          correct: e.correct,
          lastReviewed: e.lastReviewed,
          addedAt: e.addedAt,
        });
      }
    }

    const kept = list.filter((e) => e.source !== 'seed'); // mots capturés / manuels
    const ids = new Set(kept.map((e) => e.id));
    const now = new Date().toISOString();
    let count = 0;
    for (const row of rows) {
      const id = anchorOf(row.lemma, row.root, row.arabic);
      if (ids.has(id)) continue; // même lemme qu'un mot déjà capturé
      ids.add(id);
      const p = prog.get(row.french);
      kept.push({
        id,
        arabic: row.baseForm || row.arabic,
        gloss: row.french,
        root: row.root,
        lemma: row.lemma,
        baseForm: row.baseForm,
        baseFormType: row.baseFormType,
        source: 'seed',
        addedAt: p?.addedAt ?? now,
        box: p?.box ?? 0,
        seen: p?.seen ?? 0,
        correct: p?.correct ?? 0,
        lastReviewed: p?.lastReviewed,
      });
      count++;
    }
    writeVocab(kept);
    pushVocabBulk(getCurrentUser(), kept); // le lexique du compte inclut le seed
    window.localStorage.setItem(flagKey, SEED_VERSION);
    return count;
  } catch {
    return 0;
  }
}

/** Force la ré-importation du lexique (ajoute les manquants, garde l'existant). */
export async function importSeed(): Promise<number> {
  if (!isBrowser()) return 0;
  try {
    const rows: SeedRow[] = await fetch('/vocab-seed.json').then((r) => r.json());
    const list = getVocab();
    const have = new Set(list.map((e) => e.id));
    const now = new Date().toISOString();
    let added = 0;
    for (const row of rows) {
      const id = anchorOf(row.lemma, row.root, row.arabic);
      if (have.has(id)) continue;
      have.add(id);
      list.push({
        id,
        arabic: row.baseForm || row.arabic,
        gloss: row.french,
        root: row.root,
        lemma: row.lemma,
        baseForm: row.baseForm,
        baseFormType: row.baseFormType,
        source: 'seed',
        addedAt: now,
        box: 0,
        seen: 0,
        correct: 0,
      });
      added++;
    }
    writeVocab(list);
    window.localStorage.setItem(SEEDED_PREFIX + userKey(), '1');
    return added;
  } catch {
    return 0;
  }
}
