'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Types minimaux de la Web Speech API (absents de lib.dom selon la config TS).
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, SpeechRecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  /** Appelé avec le texte de chaque segment finalisé. */
  onFinal: (text: string) => void;
  /** Appelé avec le texte provisoire courant (non finalisé). */
  onInterim: (text: string) => void;
}

/**
 * Reconnaissance vocale continue en arabe (Web Speech API).
 * Redémarre automatiquement tant que `start()` est actif (Chrome coupe après un silence).
 */
export function useSpeechRecognition({ onFinal, onInterim }: UseSpeechRecognitionOptions) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  // Callbacks dans des refs pour ne jamais recréer l'instance de reconnaissance.
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onInterimRef.current = onInterim;
  });

  // Détection du support après montage (window indisponible en SSR).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false);
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    if (shouldListenRef.current) return;
    setError(null);

    const recognition = new Ctor();
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) onFinalRef.current(text);
        else interim += ' ' + text;
      }
      onInterimRef.current(interim.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setListening(false);
        setError("Accès au micro refusé. Autorisez le micro dans les réglages du navigateur.");
      }
      // 'no-speech' / 'aborted' / 'network' : le onend relancera si besoin.
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        // Chrome s'arrête après un silence : on relance sans changer l'état visible.
        try {
          recognition.start();
        } catch {
          setListening(false);
          shouldListenRef.current = false;
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      shouldListenRef.current = false;
      setError('Impossible de démarrer la reconnaissance vocale.');
    }
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
