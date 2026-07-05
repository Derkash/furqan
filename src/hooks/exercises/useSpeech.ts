'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Cache des audios déjà synthétisés (par texte) : la réécoute est instantanée.
const audioCache = new Map<string, string>();

/**
 * Lecture vocale française de qualité : le texte est synthétisé côté serveur
 * (/api/tts, voix neurale Microsoft) et joué en MP3. `loading` pendant la
 * synthèse, `speaking` pendant la lecture.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
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
  }, []);

  const speak = useCallback(async (text: string) => {
    const requestId = ++requestIdRef.current;
    if (audioRef.current) audioRef.current.pause();
    setSpeaking(false);

    let url = audioCache.get(text);
    if (!url) {
      setLoading(true);
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        audioCache.set(text, url);
      } catch {
        if (requestId === requestIdRef.current) setLoading(false);
        return;
      }
      if (requestId !== requestIdRef.current) return; // annulé entre-temps
      setLoading(false);
    }

    if (!audioRef.current && typeof window !== 'undefined') {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
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

  return { supported: true, speaking, loading, speak, stop };
}
