// Surlignage d'un mot dans une traduction française.
// On n'a pas d'alignement mot-à-mot officiel de Hamidullah ; le LLM nous renvoie
// donc `frSpan` : le(s) mot(s) français RECOPIÉS À L'IDENTIQUE du verset qui
// rendent le mot arabe. Ici on repère ces mots dans le verset par égalité EXACTE
// (normalisée : minuscules, sans accents, sans ponctuation) — fiable car ce sont
// littéralement des mots du verset. Renvoie des segments { t, hit } à rendre.

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

/** Mot normalisé (lettres seules, sans accents) pour la comparaison. */
function wordKey(w: string): string {
  return norm(w).replace(/[^a-z]/g, '');
}

/** Mots « signifiants » de frSpan (mots-outils écartés), normalisés. */
function needleWords(span: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(span).split(/[^a-z]+/)) {
    if (w.length >= 2 && !FR_STOP.has(w)) out.add(w);
  }
  return out;
}

export interface FrSegment {
  t: string;
  hit: boolean;
}

/**
 * Découpe `verse` en segments et marque hit=true les mots dont la forme
 * normalisée est EXACTEMENT un mot de `frSpan` (recopié du verset par le LLM).
 * Si `frSpan` est vide/ininterprétable → un seul segment non surligné.
 */
export function highlightFrench(verse: string, frSpan: string): FrSegment[] {
  const needles = needleWords(frSpan || '');
  if (!needles.size) return [{ t: verse, hit: false }];
  return verse.split(/(\s+)/).map((p) => {
    if (!p || /^\s+$/.test(p)) return { t: p, hit: false };
    const k = wordKey(p);
    return { t: p, hit: k.length >= 2 && needles.has(k) };
  });
}
