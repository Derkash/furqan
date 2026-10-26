// Progression d'écoute du tafsir audio : position dans chaque fichier, fichiers
// écoutés, dernière session (pour reprendre exactement là où on s'est arrêté,
// même après fermeture de l'app) et vitesse.
//
// localStorage = source de vérité en lecture ; Supabase (RPC app_tafsir_*,
// migration 0006) = sauvegarde : la WebView iPad perd son localStorage à la
// réinstallation, on réhydrate alors depuis le compte (fusion fichier par
// fichier, le plus récent gagne).

import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/utils/exercises/userStats';

export interface FileProgress {
  pos: number; // secondes
  done: boolean; // écouté jusqu'au bout (ou marqué à la main)
  at: number; // horodatage ms de la dernière mise à jour
}

export interface TafsirSession {
  ids: string[]; // file d'écoute (ids du manifeste)
  idx: number; // fichier en cours
  pos: number; // position dans ce fichier (s)
  label: string; // ex. « Hizb 3 → 4 »
  at: number;
}

export interface TafsirState {
  files: Record<string, FileProgress>;
  session: TafsirSession | null;
  rate: number;
  at: number;
}

type Listener = (s: TafsirState) => void;

const EMPTY: TafsirState = { files: {}, session: null, rate: 1, at: 0 };
const listeners = new Set<Listener>();
let state: TafsirState = EMPTY;
let loadedFor: string | null | undefined;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

const keyFor = (user: string | null) => `almuraja3a:tafsir:${user ?? 'invite'}`;

function ensureLoaded() {
  if (typeof window === 'undefined') return;
  const user = getCurrentUser();
  if (loadedFor === user) return;
  loadedFor = user;
  try {
    const raw = window.localStorage.getItem(keyFor(user));
    state = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    state = EMPTY;
  }
}

export function getTafsirState(): TafsirState {
  ensureLoaded();
  return state;
}

export function subscribeTafsirState(fn: Listener): () => void {
  ensureLoaded();
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

function commit(next: TafsirState, { remote = 'debounce' }: { remote?: 'debounce' | 'now' | 'none' } = {}) {
  state = { ...next, at: Date.now() };
  try {
    window.localStorage.setItem(keyFor(loadedFor ?? null), JSON.stringify(state));
  } catch {
    /* stockage indisponible */
  }
  for (const l of listeners) l(state);
  if (remote === 'now') flushRemote();
  else if (remote === 'debounce' && !pushTimer) pushTimer = setTimeout(flushRemote, 20000);
}

/** Seuil « écouté » : moins de 20 s restantes ou 97 % du fichier. */
export function isFinished(pos: number, dur: number): boolean {
  return dur > 0 && (pos >= dur - 20 || pos / dur >= 0.97);
}

/** Enregistre la position dans un fichier (+ dans la session en cours). */
export function recordPosition(id: string, pos: number, dur: number, opts?: { remote?: 'debounce' | 'now' }) {
  ensureLoaded();
  const prev = state.files[id];
  const done = (prev?.done ?? false) || isFinished(pos, dur);
  const files = { ...state.files, [id]: { pos: done && isFinished(pos, dur) ? 0 : pos, done, at: Date.now() } };
  let session = state.session;
  if (session && session.ids[session.idx] === id) session = { ...session, pos, at: Date.now() };
  commit({ ...state, files, session }, { remote: opts?.remote });
}

export function setFileDone(id: string, done: boolean) {
  ensureLoaded();
  const prev = state.files[id];
  commit({ ...state, files: { ...state.files, [id]: { pos: prev?.pos ?? 0, done, at: Date.now() } } }, { remote: 'now' });
}

export function setSession(session: TafsirSession | null) {
  ensureLoaded();
  commit({ ...state, session }, { remote: 'now' });
}

export function setTafsirRate(rate: number) {
  ensureLoaded();
  commit({ ...state, rate });
}

// ---------- Supabase ----------

export function flushRemote() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const user = getCurrentUser();
  if (!supabase || !user) return;
  supabase
    .rpc('app_tafsir_save', { p_username: user, p_data: state })
    .then(({ error }) => {
      if (error) console.warn('[tafsir] sauvegarde distante', error.message);
    });
}

function merge(local: TafsirState, remote: TafsirState): TafsirState {
  const files: Record<string, FileProgress> = { ...remote.files };
  for (const [id, f] of Object.entries(local.files)) {
    const r = files[id];
    if (!r || f.at >= r.at) files[id] = f;
  }
  const ls = local.session;
  const rs = remote.session;
  const session = !ls ? rs : !rs ? ls : ls.at >= rs.at ? ls : rs;
  const rate = local.at >= remote.at ? local.rate : remote.rate;
  return { files, session, rate, at: Math.max(local.at, remote.at) };
}

/** Récupère la sauvegarde du compte et la fusionne avec l'état local. */
export async function hydrateTafsirFromRemote(): Promise<void> {
  ensureLoaded();
  const user = getCurrentUser();
  if (!supabase || !user) return;
  const { data, error } = await supabase.rpc('app_tafsir_load', { p_username: user });
  if (error || !data) return;
  // Repousse la fusion : le compte récupère aussi ce qui n'existait qu'en local.
  commit(merge(state, { ...EMPTY, ...(data as TafsirState) }), { remote: 'now' });
}
