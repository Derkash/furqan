// Familles de SENS par racine (table fixe, hors ligne) : public/morphology/root-families.json
// { racine: [ { s: "sens résumé", l: ["lemme", …] }, … ] }
// Construite à partir des traductions en contexte (map Hamidullah) : deux mots
// de même racine ne sont « liés » que s'ils sont dans la même famille de sens
// (ex. دار « demeure » et دائِرَة « revers de fortune » : familles séparées).

export interface RootFamily {
  s: string; // sens résumé de la famille
  l: string[]; // lemmes
}

let promise: Promise<Record<string, RootFamily[]>> | null = null;

export function loadRootFamilies(): Promise<Record<string, RootFamily[]>> {
  if (!promise) {
    promise = fetch('/morphology/root-families.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return promise;
}

const nfc = (s: string) => s.normalize('NFC');

/** Famille d'un lemme dans sa racine (null si inconnue). */
export function familyOf(fams: RootFamily[] | undefined, lemma: string): RootFamily | null {
  if (!fams) return null;
  const n = nfc(lemma);
  return fams.find((f) => f.l.some((x) => nfc(x) === n)) ?? null;
}
