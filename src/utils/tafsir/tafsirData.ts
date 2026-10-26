// Tafsir audio (cours en français, fichiers personnels) — manifeste et mapping.
//
// Chaque fichier couvre un groupe de versets d'une sourate (Al-Baqarah,
// Al Imran) ou une sourate entière (Juz 'Amma + Al-Fatiha). Le manifeste
// public/tafsir-audio.json est généré par scripts/tafsir/build-tafsir-audio.mjs ;
// l'audio est streamé depuis le bucket public Supabase `tafsir`.
//
// Une plage (pages / hizb / juz / sourates) se ramène à des bornes globales de
// versets ; on joue alors TOUS les fichiers qui la recoupent, entiers (jamais
// découpés), dans l'ordre du mushaf.

import { getCurrentUser } from '@/utils/exercises/userStats';
import { toGlobalAyahNumber } from '@/utils/ayahMapping';

export interface TafsirItem {
  id: string; // ex. "002/021-025", "078/all", "078/intro"
  surah: number;
  from: number; // 0 pour l'introduction du Juz 'Amma
  to: number;
  whole?: boolean; // sourate entière en un seul fichier
  kind?: 'intro';
  lesson?: number; // cours numérotés (An-Nisa) : plusieurs leçons sur les mêmes versets
  dur: number; // secondes
  path: string;
}

interface Manifest {
  version: number;
  items: TafsirItem[];
}

// Réservé aux comptes du propriétaire (contenu personnel, pas de droits de
// diffusion) : l'entrée de menu et l'écran ne s'affichent que pour eux.
const TAFSIR_USERS = ['derkash', 'abdoulkhader'];

export function isTafsirUser(user: string | null = getCurrentUser()): boolean {
  return !!user && TAFSIR_USERS.includes(user.trim().toLowerCase());
}

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://cfydyjtmvpwktuovyyfr.supabase.co'}/storage/v1/object/public/tafsir`;

export function tafsirAudioUrl(item: TafsirItem): string {
  return `${STORAGE_BASE}/${item.path}`;
}

let manifestPromise: Promise<TafsirItem[]> | null = null;

export function loadTafsirItems(): Promise<TafsirItem[]> {
  if (!manifestPromise) {
    manifestPromise = fetch('/tafsir-audio.json')
      .then((r) => r.json() as Promise<Manifest>)
      .then((m) => m.items)
      .catch(() => {
        manifestPromise = null;
        return [];
      });
  }
  return manifestPromise;
}

/** Bornes globales [premier, dernier verset] couvertes par un fichier. */
export function itemGlobalRange(it: TafsirItem): [number, number] {
  if (it.kind === 'intro') {
    const g = toGlobalAyahNumber(78, 1);
    return [g, g];
  }
  return [toGlobalAyahNumber(it.surah, it.from), toGlobalAyahNumber(it.surah, it.to)];
}

/**
 * Fichiers qui recoupent la plage, dans l'ordre du mushaf. L'introduction du
 * Juz 'Amma n'est incluse que si la plage commence à An-Naba 1 ou avant.
 */
export function itemsForBounds(items: TafsirItem[], startGlobal: number, endGlobal: number): TafsirItem[] {
  return items.filter((it) => {
    const [a, b] = itemGlobalRange(it);
    if (it.kind === 'intro') return startGlobal <= a && endGlobal >= a;
    return a <= endGlobal && b >= startGlobal;
  });
}

/** Fichier(s) qui contiennent un verset donné (intro exclue). */
export function itemsForVerse(items: TafsirItem[], surah: number, verse: number): TafsirItem[] {
  return items.filter((it) => !it.kind && it.surah === surah && verse >= it.from && verse <= it.to);
}

/** Groupes de versets SANS tafsir dans la plage, par sourate : [{surah, from, to}]. */
export function gapsInBounds(
  items: TafsirItem[],
  startGlobal: number,
  endGlobal: number,
  globalToKey: (g: number) => { surah: number; verse: number }
): { surah: number; from: number; to: number }[] {
  const covered = new Set<number>();
  for (const it of items) {
    if (it.kind) continue;
    const [a, b] = itemGlobalRange(it);
    for (let g = Math.max(a, startGlobal); g <= Math.min(b, endGlobal); g++) covered.add(g);
  }
  const gaps: { surah: number; from: number; to: number }[] = [];
  for (let g = startGlobal; g <= endGlobal; g++) {
    if (covered.has(g)) continue;
    const { surah, verse } = globalToKey(g);
    const last = gaps[gaps.length - 1];
    if (last && last.surah === surah && last.to === verse - 1) last.to = verse;
    else gaps.push({ surah, from: verse, to: verse });
  }
  return gaps;
}

/** Durée lisible : « 2 h 05 », « 47 min », « 3 min 20 ». */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m >= 10) return `${m} min`;
  const r = s % 60;
  return m > 0 ? `${m} min ${String(r).padStart(2, '0')}` : `${r} s`;
}

/** Horloge : « 1:02:05 » ou « 12:34 ». */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
