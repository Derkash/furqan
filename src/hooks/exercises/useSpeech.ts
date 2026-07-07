'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Cache des audios déjà synthétisés (par texte) : la réécoute est instantanée.
const audioCache = new Map<string, string>();
// Requêtes en cours (dédupliquées) : un même texte n'est jamais synthétisé deux fois.
const pending = new Map<string, Promise<string | null>>();

/** Récupère (ou synthétise) l'audio d'un texte, avec cache et déduplication. */
function fetchTTS(text: string): Promise<string | null> {
  const cached = audioCache.get(text);
  if (cached) return Promise.resolve(cached);
  if (!pending.has(text)) {
    pending.set(
      text,
      fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
          const url = URL.createObjectURL(await res.blob());
          audioCache.set(text, url);
          return url;
        })
        .catch(() => null)
        .finally(() => {
          pending.delete(text);
        })
    );
  }
  return pending.get(text)!;
}

/** Précharge l'audio d'un texte en tâche de fond (sans le jouer). */
export function prefetchSpeech(text: string | null | undefined) {
  if (text) void fetchTTS(text);
}

/**
 * Lecture vocale française de qualité : le texte est synthétisé côté serveur
 * (/api/tts, voix neurale Microsoft) et joué en MP3. `loading` pendant la
 * synthèse, `speaking` pendant la lecture.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  // Progression de la lecture (0..1) — permet au texte de suivre la voix.
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Jeton de requête : une demande plus récente annule l'effet des anciennes.
  const requestIdRef = useRef(0);

  const stop = useCallback(() => {
    requestIdRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
    setLoading(false);
    setProgress(0);
  }, []);

  const speak = useCallback(async (text: string) => {
    const requestId = ++requestIdRef.current;
    if (audioRef.current) audioRef.current.pause();
    setSpeaking(false);

    let url = audioCache.get(text) ?? null;
    if (!url) {
      setLoading(true);
      url = await fetchTTS(text);
      if (requestId !== requestIdRef.current) return; // annulé entre-temps
      setLoading(false);
      if (!url) return;
    }

    if (!audioRef.current && typeof window !== 'undefined') {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    audio.ontimeupdate = () => {
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    try {
      await audio.play();
      if (requestId === requestIdRef.current) setSpeaking(true);
      else audio.pause();
    } catch {
      setSpeaking(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current++;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return { supported: true, speaking, loading, progress, speak, stop };
}
