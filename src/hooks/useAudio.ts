'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { AudioState, VersePosition } from '@/types';
import { getAudioUrl } from '@/utils/ayahMapping';

interface UseAudioReturn extends AudioState {
  play: (verse: VersePosition) => Promise<void>;
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (verse: VersePosition) => {
    if (!audioRef.current) return;

    try {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        currentVerse: verse,
      }));

      const audioUrl = getAudioUrl(verse.globalNumber);
      audioRef.current.src = audioUrl;

      await audioRef.current.play();

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
    if (audioRef.current) {
      audioRef.current.pause();
      setState((prev) => ({
        ...prev,
        isPlaying: false,
      }));
    }
  }, []);

  const stop = useCallback(() => {
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

  return {
    ...state,
    play,
    pause,
    stop,
  };
}
