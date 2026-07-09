'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { AudioState, VersePosition } from '@/types';
import { getAudioUrl } from '@/utils/ayahMapping';

interface UseAudioReturn extends AudioState {
  /** Joue le verset ; `maxSeconds` coupe l'extrait après N secondes (absent/0 = complet). */
  play: (verse: VersePosition, maxSeconds?: number) => Promise<void>;
  pause: () => void;
  stop: () => void;
}

/**
 * Hook pour gérer la lecture audio des versets
 */
export function useAudio(): UseAudioReturn {
  const [state, setState] = useState<AudioState>({
    isPlaying: false,
    isLoading: false,
    currentVerse: null,
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Minuteur de coupure quand on ne joue qu'un extrait (durée de question limitée).
  const cutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCutTimer = () => {
    if (cutTimerRef.current) {
      clearTimeout(cutTimerRef.current);
      cutTimerRef.current = null;
    }
  };

  // Initialiser l'élément audio
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      audioRef.current = new Audio();

      audioRef.current.addEventListener('ended', () => {
        setState((prev) => ({
          ...prev,
          isPlaying: false,
        }));
      });

      audioRef.current.addEventListener('error', () => {
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          isLoading: false,
          error: 'Erreur de chargement audio',
        }));
      });
    }

    return () => {
      clearCutTimer();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (verse: VersePosition, maxSeconds?: number) => {
    if (!audioRef.current) return;

    try {
      clearCutTimer();
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        currentVerse: verse,
      }));

      const audioUrl = getAudioUrl(verse.globalNumber);
      audioRef.current.src = audioUrl;

      await audioRef.current.play();

      if (maxSeconds && maxSeconds > 0) {
        cutTimerRef.current = setTimeout(() => {
          audioRef.current?.pause();
          setState((prev) => ({ ...prev, isPlaying: false }));
        }, maxSeconds * 1000);
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isPlaying: true,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isPlaying: false,
        error: error instanceof Error ? error.message : 'Erreur audio',
      }));
    }
  }, []);

  const pause = useCallback(() => {
    clearCutTimer();
    if (audioRef.current) {
      audioRef.current.pause();
      setState((prev) => ({
        ...prev,
        isPlaying: false,
      }));
    }
  }, []);

  const stop = useCallback(() => {
    clearCutTimer();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState({
        isPlaying: false,
        isLoading: false,
        currentVerse: null,
        error: null,
      });
    }
  }, []);

  // Mémoïser la valeur de retour pour éviter les boucles infinies dans useEffect
  return useMemo(() => ({
    ...state,
    play,
    pause,
    stop,
  }), [state, play, pause, stop]);
}
