// Exercice « Replacer les mots » (façon Duolingo) : on prend, pour un mot du
// lexique, le FRAGMENT du verset où il apparaît (jamais le verset entier),
// on retire les mots du lexique qui s'y trouvent, et l'utilisateur les
// remet en place depuis une banque de tuiles (réponses + leurres du lexique).
//
// Le fragment vient de préférence du SENS EN CONTEXTE capturé à l'ajout
// (VocabContext : bornes choisies par l'analyse), sinon d'une fenêtre ±3 mots
// autour de la première occurrence connue.

import { getVerseMorphWords, type VerseMorphWord } from './morphology';
import { bareForm, senseAt, type VocabEntry } from './vocabStore';
import { scopeVocabToPages } from './rangeScope';

export interface GapWord {
  position: number;
  entryId: string;
  answer: string; // forme attendue (sans particules de tête)
  gloss: string; // sens dans ce verset (indice)
}

export interface GapItem {
  verseKey: string;
  spanStart: number;
  spanEnd: number;
  words: VerseMorphWord[]; // mots du fragment, dans l'ordre
  gaps: GapWord[]; // trous (sous-ensemble de `words`), dans l'ordre
  tiles: string[]; // banque mélangée : réponses + leurres
}

const RADIUS = 3; // fenêtre par défaut autour du mot
const MAX_WORDS = 9; // un fragment reste court
const MAX_GAPS = 3;
const DISTRACTORS = 3;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Index lexique : lemme → entrée, forme nue → entrée (entrées sans lemme). */
function buildIndex(pool: VocabEntry[]) {
  const byLemma = new Map<string, VocabEntry>();
  const byForm = new Map<string, VocabEntry>();
  for (const e of pool) {
    if (e.lemma) byLemma.set(e.lemma.normalize('NFC'), e);
    else byForm.set(bareForm(e.arabic), e);
    for (const l of e.aliasLemmas ?? []) byLemma.set(l.normalize('NFC'), e);
    for (const f of e.aliasForms ?? []) byForm.set(bareForm(f), e);
  }
  return (w: VerseMorphWord): VocabEntry | undefined => {
    if (w.lemma) return byLemma.get(w.lemma.normalize('NFC'));
    return byForm.get(bareForm(w.display)) ?? byForm.get(bareForm(w.form));
  };
}

/** Occurrence d'ancrage d'une entrée : contexte capturé, sinon 1re occurrence connue. */
async function anchorOf(
  e: VocabEntry,
  hitVerse: string | undefined,
  lookup: (w: VerseMorphWord) => VocabEntry | undefined
): Promise<{ verseKey: string; position: number; start?: number; end?: number } | null> {
  if (e.contexts?.length) {
    const c = e.contexts[Math.floor(Math.random() * e.contexts.length)];
    return { verseKey: c.verseKey, position: c.position, start: c.spanStart, end: c.spanEnd };
  }
  for (const vk of [hitVerse, e.sampleVerseKey]) {
    if (!vk) continue;
    const words = await getVerseMorphWords(vk).catch(() => [] as VerseMorphWord[]);
    const w = words.find((x) => lookup(x)?.id === e.id);
    if (w) return { verseKey: vk, position: w.position };
  }
  return null;
}

/**
 * Construit jusqu'à `count` items pour un lexique (déjà restreint à la plage
 * si besoin). `hits` : verset de 1re apparition par entrée (depuis la plage).
 */
export async function buildGapItems(
  pool: VocabEntry[],
  count: number,
  hits?: Map<string, string>
): Promise<GapItem[]> {
  const lookup = buildIndex(pool);
  const items: GapItem[] = [];
  const usedVerses = new Set<string>();
  const covered = new Set<string>(); // entrées déjà trouées dans un item

  for (const e of shuffle(pool)) {
    if (items.length >= count) break;
    if (covered.has(e.id)) continue;
    const a = await anchorOf(e, hits?.get(e.id), lookup);
    if (!a || usedVerses.has(a.verseKey)) continue;
    const words = await getVerseMorphWords(a.verseKey).catch(() => [] as VerseMorphWord[]);
    if (!words.length) continue;
    const n = words.length;
    let start = a.start ?? Math.max(1, a.position - RADIUS);
    let end = a.end ?? Math.min(n, a.position + RADIUS);
    start = Math.max(1, Math.min(start, a.position));
    end = Math.min(n, Math.max(end, a.position));
    if (end - start + 1 > MAX_WORDS) {
      start = Math.max(start, a.position - 4);
      end = Math.min(end, start + MAX_WORDS - 1);
    }
    const frag = words.filter((w) => w.position >= start && w.position <= end);

    // Trous : le mot visé d'abord, puis les autres mots du lexique du fragment.
    const gaps: GapWord[] = [];
    const target = frag.find((w) => w.position === a.position);
    if (!target) continue;
    gaps.push({
      position: target.position,
      entryId: e.id,
      answer: target.display,
      gloss: senseAt(e, a.verseKey, a.position),
    });
    for (const w of frag) {
      if (gaps.length >= MAX_GAPS) break;
      if (w.position === a.position) continue;
      const other = lookup(w);
      if (!other || other.id === e.id) continue;
      if (gaps.some((g) => g.entryId === other.id)) continue;
      gaps.push({
        position: w.position,
        entryId: other.id,
        answer: w.display,
        gloss: senseAt(other, a.verseKey, w.position),
      });
    }
    gaps.sort((x, y) => x.position - y.position);

    // Leurres : formes d'autres mots du lexique (jamais une réponse du fragment).
    const answers = new Set(gaps.map((g) => g.answer));
    const distractors: string[] = [];
    for (const d of shuffle(pool)) {
      if (distractors.length >= DISTRACTORS) break;
      if (gaps.some((g) => g.entryId === d.id)) continue;
      const form = d.arabic.trim();
      if (!form || answers.has(form) || distractors.includes(form)) continue;
      distractors.push(form);
    }

    for (const g of gaps) covered.add(g.entryId);
    usedVerses.add(a.verseKey);
    items.push({
      verseKey: a.verseKey,
      spanStart: start,
      spanEnd: end,
      words: frag,
      gaps,
      tiles: shuffle([...gaps.map((g) => g.answer), ...distractors]),
    });
  }
  return items;
}

/** Lexique jouable : restreint à la plage (si définie) + verset de 1re apparition. */
export async function playablePool(
  all: VocabEntry[],
  startPage: number | null,
  endPage: number | null
): Promise<{ pool: VocabEntry[]; hits: Map<string, string> }> {
  const hits = new Map<string, string>();
  const full =
    startPage != null && endPage != null &&
    Math.min(startPage, endPage) <= 1 &&
    Math.max(startPage, endPage) >= 604;
  if (startPage == null || endPage == null || full) return { pool: all, hits };
  const scoped = await scopeVocabToPages(all, startPage, endPage);
  for (const s of scoped) hits.set(s.entry.id, s.hit.verseKey);
  return { pool: scoped.map((s) => s.entry), hits };
}
