// Surlignage « best-effort » d'un mot dans une traduction française.
// On n'a pas d'alignement mot-à-mot officiel de Hamidullah ; on repère donc le(s)
// mot(s) du verset dont le RADICAL correspond au sens du mot ciblé (son gloss) :
// sans accents, tolérant à la conjugaison/dérivation. Renvoie des segments
// { t, hit } à rendre (le mot ciblé étant marqué hit=true).

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

/** Radical approximatif d'un mot français (sans accents, tronqué). */
function stemOf(word: string): string {
  const n = norm(word).replace(/[^a-z]/g, '');
  if (n.length <= 4) return n;
  return n.slice(0, Math.max(4, n.length - 2)); // coupe la désinence
}

/** Radicaux « signifiants » d'un gloss (mots-outils écartés). */
function needleStems(needle: string): string[] {
  const out = new Set<string>();
  for (const w of norm(needle).split(/[^a-z]+/)) {
    if (w.length >= 3 && !FR_STOP.has(w)) out.add(stemOf(w));
  }
  return [...out];
}

export interface FrSegment {
  t: string;
  hit: boolean;
}

/**
 * Découpe `verse` en segments et marque hit=true les mots dont le radical
 * correspond à celui d'un mot signifiant de `needle` (le gloss du mot ciblé).
 * Si aucun radical exploitable → un seul segment non surligné.
 */
export function highlightFrench(verse: string, needle: string): FrSegment[] {
  const stems = needleStems(needle || '');
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
