// Surlignage d'un mot dans une traduction française.
// On n'a pas d'alignement mot-à-mot officiel de Hamidullah. On combine donc
// plusieurs AIGUILLES (frSpan renvoyé par le LLM + gloss contextuel + gloss de
// racine) et, pour chaque mot signifiant d'une aiguille, on surligne le mot du
// verset qui lui ressemble le PLUS (plus long préfixe commun, sans accents,
// tolérant à la conjugaison : « présenter » ↔ « présenta », « s'écarter » ↔
// « écarter »). Objectif : surligner systématiquement le mot dès qu'il est là.

const FR_STOP = new Set([
  'le', 'la', 'les', 'un', 'une', 'de', 'des', 'du', 'au', 'aux', 'et', 'ou',
  'a', 'à', 'en', 'dans', 'par', 'pour', 'sur', 'sous', 'avec', 'sans', 'que',
  'qui', 'quoi', 'dont', 'ne', 'pas', 'plus', 'ce', 'cet', 'cette', 'ces', 'se',
  'sa', 'son', 'ses', 'leur', 'leurs', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'nos', 'vos', 'votre', 'notre', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous',
  'ils', 'elles', 'me', 'te', 'lui', 'y', 'est', 'sont', 'etre', 'ete', 'avoir',
  'ont', 'ceux', 'celle', 'celui', 'car', 'donc', 'ainsi', 'lorsque', 'quand',
  'comme', 'tout', 'toute', 'tous', 'toutes', 'their', 'the',
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // enlève les accents
}

/** Longueur du préfixe commun entre deux chaînes. */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Mots « signifiants » d'une aiguille (mots-outils écartés), normalisés. */
function needleWords(...needles: string[]): string[] {
  const out = new Set<string>();
  for (const nd of needles) {
    for (const w of norm(nd || '').split(/[^a-z]+/)) {
      if (w.length >= 3 && !FR_STOP.has(w)) out.add(w);
    }
  }
  return [...out];
}

export interface FrSegment {
  t: string;
  hit: boolean;
}

const SEP = /^(\s+|['’‑-]+)$/;

/**
 * Découpe `verse` en segments et surligne, pour CHAQUE mot signifiant des
 * aiguilles fournies, le mot du verset dont le préfixe commun est le plus long
 * (à condition qu'il couvre presque tout le plus court des deux mots — tolérance
 * de 2 caractères pour la désinence). Les séparateurs (espaces, apostrophes,
 * traits d'union) restent des segments non surlignés.
 */
export function highlightFrench(verse: string, ...needles: string[]): FrSegment[] {
  const nwords = needleWords(...needles);
  const segs = verse.split(/(\s+|['’‑-]+)/);
  if (!nwords.length) return segs.map((t) => ({ t, hit: false }));

  // Clé normalisée (lettres seules) de chaque segment de mot.
  const keys = segs.map((p) => (!p || SEP.test(p) ? '' : norm(p).replace(/[^a-z]/g, '')));
  const hits = new Set<number>();
  for (const n of nwords) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.length < 3) continue;
      const cp = commonPrefix(k, n);
      // Le préfixe commun doit couvrir presque tout le plus court des deux mots.
      if (cp >= 3 && cp >= Math.min(k.length, n.length) - 2 && cp > bestScore) {
        bestScore = cp;
        best = i;
      }
    }
    if (best >= 0) hits.add(best);
  }
  return segs.map((t, i) => ({ t, hit: hits.has(i) }));
}
