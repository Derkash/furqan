/**
 * Récitation FRANÇAISE par âyah (Youssouf Leclerc, traduction Hamidullah).
 *
 * On ne code AUCUNE URL en dur : on interroge l'API développeur d'alquran.cloud
 * (`/v1/edition?format=audio&language=fr`) pour découvrir l'édition audio
 * française disponible, puis on sert les fichiers depuis le même CDN que Husary
 * (`cdn.islamic.network/quran/audio/{bitrate}/{edition}/{n° global}.mp3`).
 *
 * Avantages : par verset nativement, schéma identique à l'audio arabe existant,
 * et si l'édition change d'identifiant côté serveur, la découverte s'adapte.
 */

import { getLocalFrenchAudioUrl } from './audioStore';

const EDITIONS_API = 'https://api.alquran.cloud/v1/edition?format=audio&language=fr';
const CDN = 'https://cdn.islamic.network/quran/audio';
// Débits proposés par le CDN, du meilleur au plus léger (on essaie dans l'ordre).
const BITRATES = [128, 64, 48, 40, 32] as const;
const LS_KEY = 'almuraja3a:fr-recitation-edition';

interface AudioEdition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
}

let cached: string | null | undefined; // undefined = pas encore résolu, null = aucune

/** Choisit la meilleure édition française (préfère Leclerc / Hamidullah). */
function pick(editions: AudioEdition[]): string | null {
  if (!editions.length) return null;
  const score = (e: AudioEdition) => {
    const hay = `${e.identifier} ${e.name} ${e.englishName}`.toLowerCase();
    if (hay.includes('leclerc')) return 3;
    if (hay.includes('hamidullah') || hay.includes('hamidoullah')) return 2;
    return 1;
  };
  return [...editions].sort((a, b) => score(b) - score(a))[0].identifier;
}

/**
 * Résout (une fois) l'identifiant de l'édition audio française et le mémorise.
 * Retourne null si aucune édition française n'est disponible.
 */
export async function resolveFrenchEdition(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(LS_KEY);
    if (saved) {
      cached = saved;
      return cached;
    }
  }
  try {
    const res = await fetch(EDITIONS_API);
    const json = await res.json();
    const editions: AudioEdition[] = Array.isArray(json?.data) ? json.data : [];
    cached = pick(editions);
    if (cached && typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, cached);
    }
  } catch {
    cached = null;
  }
  return cached ?? null;
}

/**
 * Liste ordonnée d'URL candidates (par débit) pour un verset donné, dans
 * l'édition française résolue. À essayer successivement : si un débit n'existe
 * pas pour cette édition (404), on passe au suivant.
 * App iPad : le mp3 téléchargé en local passe en tête s'il existe.
 */
export function frenchAyahUrls(edition: string, globalNumber: number): string[] {
  const remote = BITRATES.map((b) => `${CDN}/${b}/${edition}/${globalNumber}.mp3`);
  const local = getLocalFrenchAudioUrl(globalNumber);
  return local ? [local, ...remote] : remote;
}

/** URL candidates pour TÉLÉCHARGER un verset français (débits du CDN). */
export function frenchDownloadUrls(edition: string, globalNumber: number): string[] {
  return BITRATES.map((b) => `${CDN}/${b}/${edition}/${globalNumber}.mp3`);
}
