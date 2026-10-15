// Écoute continue : récitation Husary SANS INTERRUPTION d'un verset de début à
// un verset de fin, totalement indépendante de la Lecture (aucun suivi de page,
// aucun surlignage, aucune logique d'exercice qui pourrait la couper).
//
// Robustesse :
//   - UN SEUL lecteur audio pour toute la session (une seule session « Now
//     Playing » iOS, contrôles de l'écran verrouillé, lecture app réduite —
//     voir UIBackgroundModes=audio + AVAudioSession .playback côté natif) ;
//   - le verset SUIVANT est préchargé en permanence dans un second élément
//     (jamais joué) → le changement de verset sort du cache, sans trou ;
//   - fichiers téléchargés (onglet Audio) utilisés en priorité, hors ligne ;
//   - erreur réseau sur un verset : 2 nouvelles tentatives, puis on passe au
//     suivant plutôt que de s'arrêter.
// Singleton de module : la lecture survit à la navigation dans l'app.

import { fromGlobalAyahNumber } from '@/utils/ayahMapping';
import { getLocalAudioUrl, remoteAudioUrl } from '@/utils/audioStore';

export interface PlayerState {
  active: boolean; // une session existe (en lecture ou en pause)
  playing: boolean;
  loading: boolean; // verset en cours de chargement (réseau)
  current: number | null; // n° global du verset en cours
  start: number;
  end: number;
  rate: number;
  error: string | null;
}

type Listener = (s: PlayerState) => void;

const LAST_KEY = 'almuraja3a:ecoute-last';

let state: PlayerState = {
  active: false,
  playing: false,
  loading: false,
  current: null,
  start: 1,
  end: 1,
  rate: 1,
  error: null,
};
const listeners = new Set<Listener>();
let main: HTMLAudioElement | null = null;
let preloader: HTMLAudioElement | null = null;
let retries = 0;
let surahNames: Record<number, string> = {};

function emit(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function getPlayerState(): PlayerState {
  return state;
}

export function subscribePlayer(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

/** Noms de sourates (pour l'écran verrouillé). */
export function setSurahNames(names: Record<number, string>) {
  surahNames = names;
}

function urlFor(n: number): string {
  return getLocalAudioUrl(n) ?? remoteAudioUrl(n);
}

function ensureElements() {
  if (typeof window === 'undefined') return;
  if (!main) {
    main = new Audio();
    main.preload = 'auto';
    main.addEventListener('ended', onEnded);
    main.addEventListener('error', onError);
    main.addEventListener('waiting', () => emit({ loading: true }));
    main.addEventListener('playing', () => {
      retries = 0;
      emit({ loading: false, playing: true, error: null });
    });
    main.addEventListener('pause', () => {
      if (!main?.ended) emit({ playing: false });
    });
    // iOS remet la vitesse à 1 à chaque nouvelle source : on la réapplique.
    main.addEventListener('loadedmetadata', () => {
      if (main) main.playbackRate = state.rate;
    });
  }
  if (!preloader) {
    preloader = new Audio();
    preloader.preload = 'auto';
    preloader.muted = true;
  }
}

function saveLast(n: number) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify({ n, start: state.start, end: state.end, rate: state.rate }));
  } catch {
    /* stockage indisponible */
  }
}

/** Dernière position écoutée (pour « Reprendre »). */
export function loadLast(): { n: number; start: number; end: number; rate: number } | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function updateMediaSession(n: number) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const { surah, verse } = fromGlobalAyahNumber(n);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${surahNames[surah] ?? `Sourate ${surah}`} — verset ${verse}`,
      artist: 'Mahmoud Khalil Al-Husary',
      album: 'Écoute continue',
    });
  } catch {
    /* MediaMetadata indisponible */
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
  set('play', () => resumePlayer());
  set('pause', () => pausePlayer());
  set('nexttrack', () => skip(1));
  set('previoustrack', () => skip(-1));
  set('stop', () => stopPlayer());
}

function playVerse(n: number) {
  ensureElements();
  if (!main) return;
  emit({ current: n, loading: true, error: null });
  main.src = urlFor(n);
  main.playbackRate = state.rate;
  main.play().catch(() => {
    /* l'erreur éventuelle passe par l'événement 'error' */
  });
  updateMediaSession(n);
  saveLast(n);
  // Précharge le suivant (cache HTTP) pour un enchaînement sans trou.
  if (preloader && n + 1 <= state.end) {
    preloader.src = urlFor(n + 1);
    preloader.load();
  }
}

function onEnded() {
  const n = state.current;
  if (n == null) return;
  if (n + 1 > state.end) {
    emit({ playing: false, loading: false });
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    return;
  }
  playVerse(n + 1);
}

function onError() {
  const n = state.current;
  if (n == null || !main?.src) return;
  if (retries < 2) {
    retries++;
    setTimeout(() => {
      if (state.current === n) playVerse(n);
    }, 1200 * retries);
    return;
  }
  retries = 0;
  if (n + 1 <= state.end) {
    emit({ error: `Verset ${fromGlobalAyahNumber(n).surah}:${fromGlobalAyahNumber(n).verse} indisponible — passage au suivant.` });
    playVerse(n + 1);
  } else {
    emit({ playing: false, loading: false, error: 'Lecture interrompue (réseau).' });
  }
}

/** Lance une session du verset `start` au verset `end` (n° globaux). */
export function startPlayer(start: number, end: number, rate: number, from?: number) {
  ensureElements();
  bindMediaHandlers();
  retries = 0;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  emit({ active: true, start: lo, end: hi, rate, error: null });
  const first = from != null && from >= lo && from <= hi ? from : lo;
  playVerse(first);
}

export function pausePlayer() {
  main?.pause();
  emit({ playing: false });
}

export function resumePlayer() {
  if (!main || state.current == null) return;
  if (main.ended || !main.src) {
    playVerse(state.current);
    return;
  }
  main.playbackRate = state.rate;
  main.play().catch(() => {});
}

export function stopPlayer() {
  main?.pause();
  if (main) main.removeAttribute('src');
  emit({ active: false, playing: false, loading: false, current: null, error: null });
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
  }
}

export function setPlayerRate(rate: number) {
  emit({ rate });
  if (main) main.playbackRate = rate;
  if (state.current != null) saveLast(state.current);
}

/** Verset suivant (+1) ou précédent (-1), borné à la session. */
export function skip(delta: number) {
  if (state.current == null) return;
  const n = Math.min(state.end, Math.max(state.start, state.current + delta));
  playVerse(n);
}

/** Saute directement au verset n (curseur), borné à la session. */
export function seekPlayer(n: number) {
  if (!state.active) return;
  playVerse(Math.min(state.end, Math.max(state.start, Math.round(n))));
}
