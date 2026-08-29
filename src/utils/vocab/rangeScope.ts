// Scope du VOCABULAIRE sur une plage de pages.
//
// Règle : quand une plage de lecture est définie, on n'affiche QUE les mots du
// lexique qui apparaissent RÉELLEMENT dans ces pages. La correspondance suit la
// même règle stricte que le surlignage du Mushaf (voir matchesLexicon) :
// identité par LEMME quand l'entrée en a un, sinon par forme « nue » ; la
// RACINE ne sert que de dernier recours pour les entrées sans lemme ni forme
// reconnue (une racine couvre des mots différents : كِتاب ≠ كاتِب).

import { bareForm, type VocabEntry } from './vocabStore';
import { forEachWordInPages, stripLeadingParticles } from './morphology';

export interface RangeHit {
  count: number; // nombre d'occurrences dans la plage
  firstPage: number; // 1re page où le mot apparaît dans la plage
  verseKey: string; // 1er verset où il apparaît
}

export interface RangeIndex {
  lemmas: Map<string, RangeHit>;
  forms: Map<string, RangeHit>;
  roots: Map<string, RangeHit>;
}

const indexCache = new Map<string, Promise<RangeIndex>>();

function bump(map: Map<string, RangeHit>, key: string, page: number, verseKey: string) {
  if (!key) return;
  const prev = map.get(key);
  if (!prev) {
    map.set(key, { count: 1, firstPage: page, verseKey });
    return;
  }
  prev.count++;
  if (page < prev.firstPage) {
    prev.firstPage = page;
    prev.verseKey = verseKey;
  }
}

/** Index (lemmes / formes / racines) de tout ce qui est présent dans la plage. */
export function getRangeIndex(startPage: number, endPage: number): Promise<RangeIndex> {
  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);
  const key = `${lo}-${hi}`;
  const cached = indexCache.get(key);
  if (cached) return cached;

  const p = (async () => {
    const idx: RangeIndex = { lemmas: new Map(), forms: new Map(), roots: new Map() };
    await forEachWordInPages(lo, hi, (m, verseKey, page) => {
      if (m.lemma) bump(idx.lemmas, m.lemma.normalize('NFC'), page, verseKey);
      if (m.root) bump(idx.roots, m.root, page, verseKey);
      const bare = bareForm(stripLeadingParticles(m));
      bump(idx.forms, bare, page, verseKey);
      const raw = bareForm(m.form); // forme brute (particules comprises)
      if (raw !== bare) bump(idx.forms, raw, page, verseKey);
    });
    return idx;
  })();

  indexCache.set(key, p);
  return p;
}

function merge(a: RangeHit | null, b?: RangeHit): RangeHit | null {
  if (!b) return a;
  if (!a) return { ...b };
  return {
    count: a.count + b.count,
    firstPage: Math.min(a.firstPage, b.firstPage),
    verseKey: b.firstPage < a.firstPage ? b.verseKey : a.verseKey,
  };
}

/** Occurrences d'une entrée du lexique dans la plage (null si absente). */
export function hitInRange(idx: RangeIndex, e: VocabEntry): RangeHit | null {
  let hit: RangeHit | null = null;

  // 1) Identité par lemme (entrée + doublons de sens fusionnés).
  for (const l of [e.lemma, ...(e.aliasLemmas ?? [])]) {
    if (l) hit = merge(hit, idx.lemmas.get(l.normalize('NFC')));
  }

  // 2) Forme exacte (utile pour les entrées capturées sans lemme).
  for (const f of [e.arabic, e.baseForm, ...(e.aliasForms ?? [])]) {
    if (f) hit = merge(hit, idx.forms.get(bareForm(f)));
  }

  // 3) Dernier recours : racine, uniquement si l'entrée n'a pas de lemme
  //    (sinon on ré-élargirait à des mots différents de la même racine).
  if (!hit && !e.lemma && e.root) hit = merge(hit, idx.roots.get(e.root));

  return hit;
}

export interface ScopedEntry {
  entry: VocabEntry;
  hit: RangeHit;
}

/**
 * Filtre le lexique sur une plage de pages, trié par ordre d'apparition
 * (page de 1re occurrence DANS la plage).
 */
export async function scopeVocabToPages(
  entries: VocabEntry[],
  startPage: number,
  endPage: number
): Promise<ScopedEntry[]> {
  const idx = await getRangeIndex(startPage, endPage);
  const out: ScopedEntry[] = [];
  for (const entry of entries) {
    const hit = hitInRange(idx, entry);
    if (hit) out.push({ entry, hit });
  }
  out.sort((a, b) => a.hit.firstPage - b.hit.firstPage || b.hit.count - a.hit.count);
  return out;
}
