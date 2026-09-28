// Sauvegarde DURABLE de l'état local dans le conteneur de l'app (Capacitor
// Filesystem, Directory.Data), et réhydratation au démarrage.
//
// POURQUOI : sur iOS, le stockage du WKWebView (localStorage, cookies) n'est
// pas garanti — le système le purge parfois (redémarrage de l'appareil, purge
// de stockage, réinstallation du build). Tout partait alors d'un coup :
// programme de récitation, session, vocabulaire… et il fallait tout refaire.
// Un fichier du conteneur, lui, survit : il ne disparaît qu'avec l'app.
//
// Le fichier est un MIROIR : localStorage reste la source de vérité des
// lectures (synchrone). On n'y restaure que les clés ABSENTES en local — une
// valeur présente est forcément plus fraîche que le miroir.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const FILE = 'state-backup.json';
const PREFIX = 'almuraja3a:';

// Hors sauvegarde : caches reconstructibles (traductions, occurrences) et
// snapshots redondants du lexique — gros, et sans valeur en cas de perte.
const SKIP_PREFIXES = ['almuraja3a:cache:', 'almuraja3a:vocab-backup:'];

const DEBOUNCE_MS = 1500;

interface Snapshot {
  savedAt: string;
  entries: Record<string, string>;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isBackedUp(key: string): boolean {
  return key.startsWith(PREFIX) && !SKIP_PREFIXES.some((p) => key.startsWith(p));
}

/** Toutes les clés de l'app présentes en localStorage (hors caches). */
function readLocalState(): Record<string, string> {
  const entries: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !isBackedUp(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value != null) entries[key] = value;
    }
  } catch {
    // stockage indisponible : rien à sauvegarder
  }
  return entries;
}

let timer: number | null = null;
let lastWritten: string | null = null;
let writing: Promise<void> | null = null;

/**
 * Programme une sauvegarde (regroupée) du miroir. À appeler après toute
 * écriture qui compte : programme de récitation, session, lexique, réglages.
 * No-op sur le web (rien à protéger : le navigateur ne purge pas seul).
 */
export function scheduleStateBackup(): void {
  if (!isNative() || typeof window === 'undefined') return;
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void flushStateBackup();
  }, DEBOUNCE_MS);
}

/** Écrit le miroir immédiatement (mise en arrière-plan, fermeture…). */
export async function flushStateBackup(): Promise<void> {
  if (!isNative() || typeof window === 'undefined') return;
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  // Une seule écriture à la fois : on sérialise les rafales.
  const run = async () => {
    const entries = readLocalState();
    if (Object.keys(entries).length === 0) return; // rien à sauvegarder
    const payload = JSON.stringify({ savedAt: new Date().toISOString(), entries } satisfies Snapshot);
    // Inchangé depuis la dernière écriture (hors horodatage) : on s'abstient.
    const signature = JSON.stringify(entries);
    if (signature === lastWritten) return;
    try {
      await Filesystem.writeFile({
        path: FILE,
        directory: Directory.Data,
        data: payload,
        encoding: Encoding.UTF8,
      });
      lastWritten = signature;
    } catch {
      // Filesystem indisponible : l'app continue, sans filet.
    }
  };
  writing = (writing ?? Promise.resolve()).then(run, run);
  return writing;
}

/**
 * Restaure depuis le miroir les clés MANQUANTES en local (après une purge du
 * WKWebView, elles le sont toutes). Renvoie le nombre de clés rétablies.
 */
export async function restoreStateFromDisk(): Promise<number> {
  if (!isNative() || typeof window === 'undefined') return 0;
  let snapshot: Snapshot | null = null;
  try {
    const { data } = await Filesystem.readFile({
      path: FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    snapshot = JSON.parse(typeof data === 'string' ? data : '') as Snapshot;
  } catch {
    return 0; // pas encore de miroir (1re utilisation), ou fichier illisible
  }
  if (!snapshot?.entries) return 0;

  let restored = 0;
  for (const [key, value] of Object.entries(snapshot.entries)) {
    if (!isBackedUp(key) || typeof value !== 'string') continue;
    try {
      if (window.localStorage.getItem(key) != null) continue; // local plus frais
      window.localStorage.setItem(key, value);
      restored++;
    } catch {
      // stockage indisponible : on arrête là
      break;
    }
  }
  if (restored > 0) lastWritten = null; // le miroir sera réécrit au prochain flush
  return restored;
}
