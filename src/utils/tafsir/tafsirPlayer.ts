// Lecteur du tafsir audio : enchaîne une file de fichiers ENTIERS (jamais
// découpés), reprend à la seconde près, continue écran verrouillé / app
// réduite (même session audio iOS que l'Écoute continue — les deux lecteurs
// s'excluent : lancer l'un met l'autre en pause).
// Singleton de module : la lecture survit à la navigation dans l'app.

import { stopPlayer as stopEcoute } from '@/utils/continuousPlayer';
import { tafsirAudioUrl, type TafsirItem } from '@/utils/tafsir/tafsirData';
import { flushRemote, getTafsirState, recordPosition, setSession } from '@/utils/tafsir/tafsirProgress';

export interface TafsirPlayerState {
  active: boolean;
  playing: boolean;
  loading: boolean;
  queue: TafsirItem[];
  idx: number;
  time: number; // position dans le fichier en cours (s)
  rate: number;
  label: string;
  error: string | null;
}

type Listener = (s: TafsirPlayerState) => void;

export const TAFSIR_FOCUS_EVENT = 'almuraja3a:tafsir-start';
export const ECOUTE_FOCUS_EVENT = 'almuraja3a:ecoute-start';

let state: TafsirPlayerState = {
  active: false,
  playing: false,
  loading: false,
  queue: [],
  idx: 0,
  time: 0,
  rate: 1,
  label: '',
  error: null,
};
const listeners = new Set<Listener>();
let audio: HTMLAudioElement | null = null;
let pendingSeek: number | null = null;
let retries = 0;
let lastSaved = 0;
let surahNames: Record<number, string> = {};

function emit(patch: Partial<TafsirPlayerState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function getTafsirPlayer(): TafsirPlayerState {
  return state;
}

export function subscribeTafsirPlayer(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function setTafsirSurahNames(names: Record<number, string>) {
  surahNames = names;
}

const current = (): TafsirItem | undefined => state.queue[state.idx];

function save(remote?: 'now') {
  const it = current();
  if (!it || !audio) return;
  lastSaved = Date.now();
  recordPosition(it.id, audio.currentTime, it.dur, remote ? { remote } : undefined);
}

function ensureAudio() {
  if (typeof window === 'undefined' || audio) return;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('loadedmetadata', () => {
    if (!audio) return;
    // iOS remet la vitesse à 1 à chaque nouvelle source.
    audio.playbackRate = state.rate;
    if (pendingSeek != null) {
      audio.currentTime = pendingSeek;
      pendingSeek = null;
    }
  });
  audio.addEventListener('waiting', () => emit({ loading: true }));
  audio.addEventListener('playing', () => {
    retries = 0;
    emit({ loading: false, playing: true, error: null });
  });
  audio.addEventListener('pause', () => {
    if (audio?.ended) return;
    emit({ playing: false });
    save('now');
  });
  audio.addEventListener('timeupdate', () => {
    if (!audio || pendingSeek != null) return;
    emit({ time: audio.currentTime });
    if (Date.now() - lastSaved > 5000) save();
    updatePositionState();
  });
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);
  // App fermée / mise en arrière-plan : on fige la position tout de suite.
  const persist = () => {
    if (state.active) {
      save();
      flushRemote();
    }
  };
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persist());
  // L'Écoute continue démarre : on se met en pause.
  window.addEventListener(ECOUTE_FOCUS_EVENT, () => state.playing && pauseTafsir());
}

function itemTitle(it: TafsirItem): string {
  const name = surahNames[it.surah] ?? `Sourate ${it.surah}`;
  if (it.kind === 'intro') return "Introduction au Juz 'Amma";
  if (it.whole) return `${name} (sourate entière)`;
  return it.from === it.to ? `${name} — verset ${it.from}` : `${name} — versets ${it.from} à ${it.to}`;
}

function updateMediaSession() {
  const it = current();
  if (!it || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: itemTitle(it),
      artist: 'Tafsir',
      album: state.label,
    });
  } catch {
    /* MediaMetadata indisponible */
  }
}

function updatePositionState() {
  const it = current();
  if (!it || !audio || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    const duration = Number.isFinite(audio.duration) ? audio.duration : it.dur;
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(audio.currentTime, duration),
      playbackRate: state.rate,
    });
  } catch {
    /* non supporté */
  }
}

function bindMediaHandlers() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(a, h);
    } catch {
      /* action non supportée */
    }
  };
  set('play', () => resumeTafsir());
  set('pause', () => pauseTafsir());
  set('seekbackward', (d) => jumpTafsir(-(d.seekOffset ?? 15)));
  set('seekforward', (d) => jumpTafsir(d.seekOffset ?? 30));
  set('seekto', (d) => d.seekTime != null && seekTafsir(d.seekTime));
  set('nexttrack', () => goToTafsir(state.idx + 1));
  set('previoustrack', () => goToTafsir(state.idx - 1));
  set('stop', () => stopTafsir());
}

function load(idx: number, at: number) {
  ensureAudio();
  const it = state.queue[idx];
  if (!audio || !it) return;
  emit({ idx, time: at, loading: true, error: null });
  pendingSeek = at > 1 ? at : null;
  audio.src = tafsirAudioUrl(it);
  audio.playbackRate = state.rate;
  audio.play().catch(() => {
    /* l'erreur éventuelle passe par l'événement 'error' */
  });
  updateMediaSession();
  const s = getTafsirState().session;
  if (s) setSession({ ...s, idx, pos: at, at: Date.now() });
}

function onEnded() {
  const it = current();
  if (it) recordPosition(it.id, it.dur, it.dur, { remote: 'now' });
  if (state.idx + 1 < state.queue.length) {
    load(state.idx + 1, 0);
    return;
  }
  // File terminée : plus rien à reprendre.
  setSession(null);
  emit({ playing: false, loading: false });
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

function onError() {
  if (!audio?.src || !state.active) return;
  const at = audio.currentTime || state.time;
  if (retries < 2) {
    retries++;
    const idx = state.idx;
    setTimeout(() => state.idx === idx && state.active && load(idx, at), 1500 * retries);
    return;
  }
  retries = 0;
  emit({ playing: false, loading: false, error: 'Audio indisponible (réseau). Réessaie dans un instant.' });
}

/**
 * Lance une file de fichiers. `label` décrit la plage choisie (affiché et
 * mémorisé pour « Reprendre »). Par défaut, chaque fichier reprend là où on
 * l'avait laissé.
 */
export function startTafsir(queue: TafsirItem[], label: string, opts: { idx?: number; pos?: number; rate?: number } = {}) {
  if (queue.length === 0) return;
  ensureAudio();
  bindMediaHandlers();
  stopEcoute();
  window.dispatchEvent(new Event(TAFSIR_FOCUS_EVENT));
  if (state.active) save('now');
  retries = 0;
  const idx = Math.min(Math.max(opts.idx ?? 0, 0), queue.length - 1);
  const saved = getTafsirState().files[queue[idx].id];
  const pos = opts.pos ?? (saved && !saved.done ? saved.pos : 0);
  emit({ active: true, queue, label, rate: opts.rate ?? getTafsirState().rate ?? state.rate });
  setSession({ ids: queue.map((q) => q.id), idx, pos, label, at: Date.now() });
  load(idx, pos);
}

export function pauseTafsir() {
  audio?.pause();
  emit({ playing: false });
}

export function resumeTafsir() {
  if (!audio || !state.active) return;
  if (!audio.src) {
    load(state.idx, state.time);
    return;
  }
  stopEcoute();
  window.dispatchEvent(new Event(TAFSIR_FOCUS_EVENT));
  audio.playbackRate = state.rate;
  audio.play().catch(() => {});
}

export function stopTafsir() {
  if (state.active) save('now');
  audio?.pause();
  audio?.removeAttribute('src');
  emit({ active: false, playing: false, loading: false, error: null });
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

export function seekTafsir(sec: number) {
  const it = current();
  if (!audio || !it) return;
  const t = Math.max(0, Math.min(sec, (Number.isFinite(audio.duration) ? audio.duration : it.dur) - 1));
  audio.currentTime = t;
  emit({ time: t });
  save();
}

export function jumpTafsir(delta: number) {
  if (!audio) return;
  seekTafsir(audio.currentTime + delta);
}

/** Passe à un autre fichier de la file (reprend à sa position mémorisée). */
export function goToTafsir(idx: number) {
  if (!state.active || idx < 0 || idx >= state.queue.length) return;
  save('now');
  const saved = getTafsirState().files[state.queue[idx].id];
  load(idx, saved && !saved.done ? saved.pos : 0);
}

export function setTafsirPlayerRate(rate: number) {
  emit({ rate });
  if (audio) audio.playbackRate = rate;
  updatePositionState();
}
