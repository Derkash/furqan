'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Synthèse vocale française (Web Speech Synthesis, embarquée dans le navigateur —
 * instantanée, gratuite, hors-ligne). Choisit automatiquement la meilleure voix
 * française disponible (voix « enhanced/premium » d'iOS/macOS en priorité).
 * Les longs textes sont découpés en phrases pour contourner la coupure ~15 s
 * de Chrome sur les voix distantes.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const remainingRef = useRef(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    // Déclenche le chargement asynchrone de la liste des voix.
    window.speechSynthesis.getVoices();
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      remainingRef.current = 0;
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    // Meilleure voix française : enhanced/premium > voix nommées connues > locale.
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'));
    const score = (v: SpeechSynthesisVoice) =>
      (/premium|enhanced|amélior/i.test(v.name) ? 4 : 0) +
      (/thomas|am[ée]lie|audrey|aur[ée]lie|siri|marie|denise/i.test(v.name) ? 2 : 0) +
      (v.localService ? 1 : 0);
    const voice = voices.sort((a, b) => score(b) - score(a))[0] ?? null;

    // Découpe en morceaux de ~250 caractères aux fins de phrases.
    const chunks: string[] = [];
    let current = '';
    for (const sentence of text.split(/(?<=[.!?؟…])\s+/)) {
      if (current.length + sentence.length > 250 && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) chunks.push(current);
    if (chunks.length === 0) return;

    remainingRef.current = chunks.length;
    setSpeaking(true);
    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = 'fr-FR';
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.onend = () => {
        remainingRef.current--;
        if (remainingRef.current <= 0) setSpeaking(false);
      };
      utterance.onerror = () => {
        remainingRef.current = 0;
        setSpeaking(false);
      };
      synth.speak(utterance);
    }
  }, []);

  return { supported, speaking, speak, stop };
}
