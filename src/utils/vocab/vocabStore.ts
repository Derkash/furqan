// Vocabulaire personnel : liste de mots à mémoriser, stockée dans localStorage
// (par utilisateur). Chaque mot est ancré sur sa RACINE (anti-doublon) ; à
// défaut de racine, sur sa forme « nue ». Révision espacée façon Leitner.
//
// Note : stockage local pour l'instant (comme l'était le suivi de progression à
// ses débuts). La synchronisation Supabase pourra être ajoutée ensuite.

import { getCurrentUser } from '@/utils/exercises/userStats';

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
const SEED_VERSION = '3';

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

export function anchorOf(root: string | undefined, arabic: string): string {
  return root ? `r:${root}` : `f:${bareForm(arabic)}`;
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
  const id = anchorOf(input.root, input.arabic);
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
  return { status: 'added', entry };
}

/** Vrai si la racine (ou forme) est déjà dans la liste. */
export function hasVocab(root: string | undefined, arabic: string): boolean {
  const id = anchorOf(root, arabic);
  return getVocab().some((e) => e.id === id);
}

export function updateVocab(id: string, patch: Partial<VocabEntry>): void {
  const list = getVocab().map((e) => (e.id === id ? { ...e, ...patch } : e));
  writeVocab(list);
}

export function removeVocab(id: string): void {
  writeVocab(getVocab().filter((e) => e.id !== id));
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
}

// ---- Seed du lexique personnel ----

interface SeedRow {
  n: number;
  arabic: string;
  french: string;
  root?: string;
  lemma?: string;
  baseForm?: string;
}

/**
 * Importe le lexique personnel (public/vocab-seed.json) la 1re fois, si la liste
 * est vide et qu'aucun import n'a encore eu lieu pour cet utilisateur.
 * Renvoie le nombre de mots importés.
 */
export async function seedVocabIfNeeded(): Promise<number> {
  if (!isBrowser()) return 0;
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
      const id = anchorOf(row.root, row.arabic);
      if (ids.has(id)) continue; // même racine qu'un mot déjà capturé
      ids.add(id);
      const p = prog.get(row.french);
      kept.push({
        id,
        arabic: row.baseForm || row.arabic,
        gloss: row.french,
        root: row.root,
        lemma: row.lemma,
        baseForm: row.baseForm,
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
      const id = anchorOf(row.root, row.arabic);
      if (have.has(id)) continue;
      have.add(id);
      list.push({
        id,
        arabic: row.baseForm || row.arabic,
        gloss: row.french,
        root: row.root,
        lemma: row.lemma,
        baseForm: row.baseForm,
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
