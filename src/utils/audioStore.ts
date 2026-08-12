/**
 * Audio hors ligne (app iPad Capacitor uniquement) — deux collections :
 *   - husary : récitation arabe Al-Husary (CDN islamic.network, 128 kbps)
 *   - french : récitation française (Youssouf Leclerc, édition découverte
 *              à l'exécution — voir frenchRecitation.ts)
 *
 * Les mp3 vivent dans Directory.Data/audio-{collection}/{n° global}.mp3.
 * Sur le web, ce module est inerte : getLocal*Url() renvoie null et l'audio
 * est streamé depuis le CDN comme avant.
 *
 * Le disque est la seule source de vérité : au démarrage, initAudioStore()
 * liste les dossiers pour reconstruire l'index en mémoire.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export type AudioCollection = 'husary' | 'french';

const DIRS: Record<AudioCollection, string> = {
  husary: 'audio-husary',
  french: 'audio-french',
};
const HUSARY_CDN = 'https://cdn.islamic.network/quran/audio/128/ar.husary';
// En-dessous de ce poids, le fichier téléchargé est considéré comme une page
// d'erreur du CDN (404 html…) et rejeté.
const MIN_VALID_BYTES = 2048;

let isNative = false;
const baseUrls: Partial<Record<AudioCollection, string>> = {};
const downloaded: Record<AudioCollection, Set<number>> = {
  husary: new Set(),
  french: new Set(),
};
let initPromise: Promise<void> | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function initAudioStore(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (!Capacitor.isNativePlatform()) return;
      for (const collection of Object.keys(DIRS) as AudioCollection[]) {
        const dir = DIRS[collection];
        try {
          await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true });
        } catch {
          // le dossier existe déjà
        }
        const { uri } = await Filesystem.getUri({ path: dir, directory: Directory.Data });
        baseUrls[collection] = Capacitor.convertFileSrc(uri);
        const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Data });
        for (const f of files) {
          const m = f.name.match(/^(\d+)\.mp3$/);
          if (m) downloaded[collection].add(Number(m[1]));
        }
      }
      isNative = true;
    })().catch(() => {
      // Filesystem indisponible : on retombe sur le streaming CDN
      isNative = false;
    });
  }
  return initPromise;
}

function localUrl(collection: AudioCollection, globalAyahNumber: number): string | null {
  const base = baseUrls[collection];
  if (!isNative || !base || !downloaded[collection].has(globalAyahNumber)) return null;
  return `${base}/${globalAyahNumber}.mp3`;
}

/** URL locale Husary servable par la WebView, ou null si non téléchargé (→ CDN). */
export function getLocalAudioUrl(globalAyahNumber: number): string | null {
  return localUrl('husary', globalAyahNumber);
}

/** URL locale de la récitation française, ou null si non téléchargée. */
export function getLocalFrenchAudioUrl(globalAyahNumber: number): string | null {
  return localUrl('french', globalAyahNumber);
}

export function remoteAudioUrl(globalAyahNumber: number): string {
  return `${HUSARY_CDN}/${globalAyahNumber}.mp3`;
}

export function countDownloadedInRange(
  collection: AudioCollection,
  first: number,
  last: number
): number {
  let n = 0;
  for (let i = first; i <= last; i++) if (downloaded[collection].has(i)) n++;
  return n;
}

export function totalDownloaded(collection: AudioCollection): number {
  return downloaded[collection].size;
}

/**
 * Télécharge un verset en essayant les URL candidates dans l'ordre.
 * Un fichier trop petit (page d'erreur du CDN) est supprimé et l'URL suivante
 * est tentée.
 */
async function downloadAyah(
  collection: AudioCollection,
  globalAyahNumber: number,
  candidateUrls: string[]
): Promise<void> {
  if (downloaded[collection].has(globalAyahNumber)) return;
  const path = `${DIRS[collection]}/${globalAyahNumber}.mp3`;
  for (const url of candidateUrls) {
    try {
      await Filesystem.downloadFile({ url, path, directory: Directory.Data });
      const info = await Filesystem.stat({ path, directory: Directory.Data });
      if (info.size >= MIN_VALID_BYTES) {
        downloaded[collection].add(globalAyahNumber);
        return;
      }
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch {
      // on tente l'URL suivante
    }
  }
  throw new Error(`Téléchargement impossible : verset ${globalAyahNumber} (${collection})`);
}

export interface DownloadHandle {
  cancel: () => void;
  done: Promise<{ ok: number; failed: number; cancelled: boolean }>;
}

/**
 * Télécharge une plage de versets (concurrence limitée, reprise implicite :
 * les fichiers déjà présents sont sautés). `urlsFor` fournit les URL candidates
 * par verset (permet husary, français multi-débits…). onProgress(faits, total).
 */
export function downloadRange(
  collection: AudioCollection,
  first: number,
  last: number,
  urlsFor: (globalAyahNumber: number) => string[],
  onProgress?: (done: number, total: number) => void
): DownloadHandle {
  let cancelled = false;
  const queue: number[] = [];
  for (let i = first; i <= last; i++) if (!downloaded[collection].has(i)) queue.push(i);
  const total = queue.length;
  let done = 0;
  let failed = 0;

  const run = async () => {
    const CONCURRENCY = 4;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (!cancelled) {
        const n = queue.shift();
        if (n === undefined) return;
        try {
          await downloadAyah(collection, n, urlsFor(n));
        } catch {
          failed++;
        }
        done++;
        onProgress?.(done, total);
      }
    });
    await Promise.all(workers);
    return { ok: done - failed, failed, cancelled };
  };

  return { cancel: () => (cancelled = true), done: run() };
}

export async function deleteRange(
  collection: AudioCollection,
  first: number,
  last: number
): Promise<void> {
  for (let i = first; i <= last; i++) {
    if (!downloaded[collection].has(i)) continue;
    try {
      await Filesystem.deleteFile({
        path: `${DIRS[collection]}/${i}.mp3`,
        directory: Directory.Data,
      });
    } catch {
      // fichier déjà absent
    }
    downloaded[collection].delete(i);
  }
}
