/**
 * Audio Husary hors ligne (app iPad Capacitor uniquement).
 *
 * Les mp3 téléchargés vivent dans le système de fichiers de l'app
 * (Directory.Data/audio-husary/{n° global}.mp3). Sur le web, ce module est
 * inerte : getLocalAudioUrl() renvoie toujours null et l'audio est streamé
 * depuis le CDN comme avant.
 *
 * Le disque est la seule source de vérité : au démarrage, initAudioStore()
 * liste le dossier pour reconstruire l'index en mémoire (Set des n° globaux).
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const AUDIO_DIR = 'audio-husary';
const CDN = 'https://cdn.islamic.network/quran/audio/128/ar.husary';

let isNative = false;
let baseUrl: string | null = null;
const downloaded = new Set<number>();
let initPromise: Promise<void> | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function initAudioStore(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        await Filesystem.mkdir({
          path: AUDIO_DIR,
          directory: Directory.Data,
          recursive: true,
        });
      } catch {
        // le dossier existe déjà
      }
      const { uri } = await Filesystem.getUri({ path: AUDIO_DIR, directory: Directory.Data });
      baseUrl = Capacitor.convertFileSrc(uri);
      const { files } = await Filesystem.readdir({ path: AUDIO_DIR, directory: Directory.Data });
      for (const f of files) {
        const m = f.name.match(/^(\d+)\.mp3$/);
        if (m) downloaded.add(Number(m[1]));
      }
      isNative = true;
    })().catch(() => {
      // Filesystem indisponible : on retombe sur le streaming CDN
      isNative = false;
    });
  }
  return initPromise;
}

/** URL locale servable par la WebView, ou null si non téléchargé (→ CDN). */
export function getLocalAudioUrl(globalAyahNumber: number): string | null {
  if (!isNative || !baseUrl || !downloaded.has(globalAyahNumber)) return null;
  return `${baseUrl}/${globalAyahNumber}.mp3`;
}

export function remoteAudioUrl(globalAyahNumber: number): string {
  return `${CDN}/${globalAyahNumber}.mp3`;
}

export function countDownloadedInRange(first: number, last: number): number {
  let n = 0;
  for (let i = first; i <= last; i++) if (downloaded.has(i)) n++;
  return n;
}

export function totalDownloaded(): number {
  return downloaded.size;
}

async function downloadAyah(globalAyahNumber: number): Promise<void> {
  if (downloaded.has(globalAyahNumber)) return;
  await Filesystem.downloadFile({
    url: remoteAudioUrl(globalAyahNumber),
    path: `${AUDIO_DIR}/${globalAyahNumber}.mp3`,
    directory: Directory.Data,
  });
  downloaded.add(globalAyahNumber);
}

export interface DownloadHandle {
  cancel: () => void;
  done: Promise<{ ok: number; failed: number; cancelled: boolean }>;
}

/**
 * Télécharge une plage de versets (concurrence limitée, reprise implicite :
 * les fichiers déjà présents sont sautés). onProgress(faits, total).
 */
export function downloadRange(
  first: number,
  last: number,
  onProgress?: (done: number, total: number) => void
): DownloadHandle {
  let cancelled = false;
  const queue: number[] = [];
  for (let i = first; i <= last; i++) if (!downloaded.has(i)) queue.push(i);
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
          await downloadAyah(n);
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

export async function deleteRange(first: number, last: number): Promise<void> {
  for (let i = first; i <= last; i++) {
    if (!downloaded.has(i)) continue;
    try {
      await Filesystem.deleteFile({ path: `${AUDIO_DIR}/${i}.mp3`, directory: Directory.Data });
      downloaded.delete(i);
    } catch {
      // fichier déjà absent : on retire quand même de l'index
      downloaded.delete(i);
    }
  }
}
