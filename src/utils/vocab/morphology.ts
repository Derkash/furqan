// Accès à la morphologie du Coran (données QAC pré-calculées dans
// public/morphology/). Fournit : analyse d'un mot (racine, forme de base,
// temps, mode, préfixes…), occurrences d'une racine sur une plage de pages,
// et libellés nahw en français. Chargement paresseux + cache mémoire.

export interface MorphPGN {
  person: string | null; // '1' | '2' | '3'
  gender: string | null; // 'M' | 'F'
  number: string | null; // 'S' | 'D' | 'P'
}

export interface MorphPrefix {
  form: string;
  type: 'conj' | 'det' | 'prep' | 'fut' | 'emph' | 'intg' | 'neg' | 'other';
}

export interface WordMorphology {
  form: string; // mot fléchi complet (vocalisé)
  pos: string; // V, N, PN, ADJ, PRON, P, DET, …
  root?: string; // racine (arabe)
  lemma?: string; // lemme (forme de base du dictionnaire)
  aspect?: 'perf' | 'impf' | 'impv'; // madi / mudari3 / amr
  mood?: 'ind' | 'subj' | 'jus'; // marfū' / manṣūb / majzūm
  verbForm?: string; // wazn (1-10)
  pgn?: MorphPGN;
  prefixes?: MorphPrefix[];
  suffixes?: { form: string }[];
}

export interface RootEntry {
  lemmas: string[];
  count: number;
  occ: string[]; // ["s:v:w", …]
}

export interface RootOccurrence {
  location: string; // "s:v:w"
  surah: number;
  verse: number;
  word: number;
  verseKey: string; // "s:v"
  page: number;
  morph: WordMorphology | null;
}

// ---- Cache de chargement ----

const surahCache = new Map<number, Record<string, WordMorphology>>();
const surahPromises = new Map<number, Promise<Record<string, WordMorphology>>>();
let rootsData: Record<string, RootEntry> | null = null;
let rootsPromise: Promise<Record<string, RootEntry>> | null = null;
let versePage: Record<string, number> | null = null;
let versePagePromise: Promise<Record<string, number>> | null = null;

async function loadSurah(surah: number): Promise<Record<string, WordMorphology>> {
  if (surahCache.has(surah)) return surahCache.get(surah)!;
  if (!surahPromises.has(surah)) {
    surahPromises.set(
      surah,
      fetch(`/morphology/words/surah-${surah}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          surahCache.set(surah, data);
          return data;
        })
        .catch(() => ({}))
    );
  }
  return surahPromises.get(surah)!;
}

export async function loadRoots(): Promise<Record<string, RootEntry>> {
  if (rootsData) return rootsData;
  if (!rootsPromise) {
    rootsPromise = fetch('/morphology/roots.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        rootsData = data;
        return data;
      })
      .catch(() => ({}));
  }
  return rootsPromise;
}

async function loadVersePage(): Promise<Record<string, number>> {
  if (versePage) return versePage;
  if (!versePagePromise) {
    versePagePromise = fetch('/morphology/verse-page.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        versePage = data;
        return data;
      })
      .catch(() => ({}));
  }
  return versePagePromise;
}

// ---- API ----

/** Analyse morphologique d'un mot repéré par (verseKey, position). */
export async function getWordMorphology(
  verseKey: string,
  position: number
): Promise<WordMorphology | null> {
  const [s, v] = verseKey.split(':').map(Number);
  const surah = await loadSurah(s);
  return surah[`${v}:${position}`] ?? null;
}

/**
 * Toutes les occurrences d'une racine, éventuellement bornées à une plage de
 * pages [startPage, endPage]. Renvoie les positions triées avec leur page et
 * (chargée à la demande) leur analyse morphologique.
 */
export async function getRootOccurrences(
  root: string,
  startPage?: number,
  endPage?: number
): Promise<RootOccurrence[]> {
  const [roots, vp] = await Promise.all([loadRoots(), loadVersePage()]);
  const entry = roots[root];
  if (!entry) return [];

  const lo = startPage != null ? Math.min(startPage, endPage ?? startPage) : 1;
  const hi = endPage != null ? Math.max(startPage ?? endPage, endPage) : 604;

  const surahsNeeded = new Set<number>();
  const filtered: { location: string; page: number }[] = [];
  for (const location of entry.occ) {
    const [s, v] = location.split(':');
    const page = vp[`${s}:${v}`] ?? 0;
    if (page >= lo && page <= hi) {
      filtered.push({ location, page });
      surahsNeeded.add(Number(s));
    }
  }

  // Charger les sourates concernées puis attacher la morphologie
  await Promise.all(Array.from(surahsNeeded).map((s) => loadSurah(s)));

  const out: RootOccurrence[] = filtered.map(({ location, page }) => {
    const [s, v, w] = location.split(':').map(Number);
    const morph = surahCache.get(s)?.[`${v}:${w}`] ?? null;
    return {
      location,
      surah: s,
      verse: v,
      word: w,
      verseKey: `${s}:${v}`,
      page,
      morph,
    };
  });

  // Tri par ordre du Mushaf (page puis position)
  out.sort((a, b) => a.page - b.page || a.surah - b.surah || a.verse - b.verse || a.word - b.word);
  return out;
}

/** Infos globales d'une racine (nombre d'occurrences, lemmes). */
export async function getRootInfo(root: string): Promise<RootEntry | null> {
  const roots = await loadRoots();
  return roots[root] ?? null;
}

/** Texte arabe (vocalisé) d'un verset, reconstruit depuis les formes QAC. */
export async function getVerseText(verseKey: string): Promise<string> {
  const [s, v] = verseKey.split(':').map(Number);
  const surah = await loadSurah(s);
  const words = Object.keys(surah)
    .filter((k) => Number(k.split(':')[0]) === v)
    .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]));
  return words.map((k) => surah[k].form).join(' ');
}

// ---- Libellés nahw en français (déterministes) ----

const ASPECT_LABEL: Record<string, string> = {
  perf: 'accompli (ماضٍ)',
  impf: 'inaccompli (مضارع)',
  impv: 'impératif (أمر)',
};

const MOOD_LABEL: Record<string, string> = {
  ind: 'indicatif — مرفوع',
  subj: 'subjonctif — منصوب (après un naṣib)',
  jus: 'apocopé — مجزوم (après un jāzim)',
};

const POS_LABEL: Record<string, string> = {
  V: 'verbe (فعل)',
  N: 'nom (اسم)',
  PN: 'nom propre (اسم علم)',
  ADJ: 'adjectif (صفة)',
  PRON: 'pronom (ضمير)',
  P: 'préposition (حرف جر)',
  DET: 'article défini',
  CONJ: 'conjonction (حرف عطف)',
  ADV: 'adverbe (ظرف)',
  REL: 'pronom relatif',
  DEM: 'démonstratif',
};

const PREFIX_LABEL: Record<MorphPrefix['type'], string> = {
  conj: 'conjonction (و / ف)',
  det: 'article défini (الـ)',
  prep: 'préposition (بـ / كـ / لـ)',
  fut: 'particule du futur (سـ)',
  emph: 'lām d’emphase (لـ)',
  intg: "hamza d'interrogation (أـ)",
  neg: 'négation',
  other: 'préfixe',
};

const PERSON_LABEL: Record<string, string> = { '1': '1re pers.', '2': '2e pers.', '3': '3e pers.' };
const GENDER_LABEL: Record<string, string> = { M: 'masc.', F: 'fém.' };
const NUMBER_LABEL: Record<string, string> = { S: 'singulier', D: 'duel', P: 'pluriel' };

/** Description nahw compacte d'un mot, en français. */
export function describeMorphology(m: WordMorphology): string[] {
  const out: string[] = [];
  out.push(POS_LABEL[m.pos] ?? m.pos);
  if (m.aspect) out.push(ASPECT_LABEL[m.aspect] ?? m.aspect);
  if (m.verbForm) out.push(`forme ${romanForm(m.verbForm)}`);
  if (m.mood) out.push(MOOD_LABEL[m.mood] ?? m.mood);
  if (m.pgn) {
    const bits = [
      m.pgn.person ? PERSON_LABEL[m.pgn.person] : null,
      m.pgn.gender ? GENDER_LABEL[m.pgn.gender] : null,
      m.pgn.number ? NUMBER_LABEL[m.pgn.number] : null,
    ].filter(Boolean);
    if (bits.length) out.push(bits.join(' '));
  }
  if (m.prefixes?.length) {
    out.push('préfixes : ' + m.prefixes.map((p) => `${p.form} (${PREFIX_LABEL[p.type]})`).join(', '));
  }
  if (m.suffixes?.length) {
    out.push('pronom suffixé : ' + m.suffixes.map((x) => x.form).join(''));
  }
  return out;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function romanForm(vf: string): string {
  const n = Number(vf);
  return Number.isFinite(n) && ROMAN[n] ? ROMAN[n] : vf;
}
