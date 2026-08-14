// Surlignage d'un mot dans une traduction française.
// On n'a pas d'alignement mot-à-mot officiel de Hamidullah ; le LLM nous renvoie
// donc `frSpan` : le(s) mot(s) français du verset qui rendent le mot arabe, dans
// leur forme CONTEXTUELLE (proche de la conjugaison du verset). On repère ces
// mots dans le verset par RADICAL (sans accents, désinence tronquée) — tolérant
// aux petites variations verbatim du LLM. Renvoie des segments { t, hit }.

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

/** Radical approximatif d'un mot français (sans accents, désinence tronquée). */
function stemOf(word: string): string {
  const n = norm(word).replace(/[^a-z]/g, '');
  if (n.length <= 4) return n;
  return n.slice(0, Math.max(4, n.length - 2));
}

/** Radicaux des mots « signifiants » de frSpan (mots-outils écartés). */
function needleStems(span: string): string[] {
  const out = new Set<string>();
  for (const w of norm(span).split(/[^a-z]+/)) {
    if (w.length >= 2 && !FR_STOP.has(w)) out.add(stemOf(w));
  }
  return [...out];
}

export interface FrSegment {
  t: string;
  hit: boolean;
}

/**
 * Découpe `verse` en segments et marque hit=true les mots dont le RADICAL
 * correspond à celui d'un mot signifiant de `frSpan`. Tolérant à la conjugaison
 * (« détournant » ↔ « détournâtes »). Si `frSpan` est vide → aucun surlignage.
 */
export function highlightFrench(verse: string, frSpan: string): FrSegment[] {
  const stems = needleStems(frSpan || '');
  if (!stems.length) return [{ t: verse, hit: false }];
  return verse.split(/(\s+)/).map((p) => {
    if (!p || /^\s+$/.test(p)) return { t: p, hit: false };
    const st = stemOf(p);
    const hit =
      st.length >= 4 &&
      stems.some(
        (s) => (s.startsWith(st) || st.startsWith(s)) && Math.min(s.length, st.length) >= 4
      );
    return { t: p, hit };
  });
}
