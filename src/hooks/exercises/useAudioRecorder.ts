'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Enregistrement audio du micro (MediaRecorder).
 * `audioUrl` devient disponible après `stop()` pour réécouter l'enregistrement.
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);

  /** Libère l'enregistrement précédent. */
  const clear = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    clear();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      return true;
    } catch {
      setError('Accès au micro refusé. Autorisez le micro dans les réglages du navigateur.');
      return false;
    }
  }, [clear]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  // Nettoyage à la sortie : couper le micro et libérer l'URL.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stream.getTracks().forEach((t) => t.stop());
        try {
          recorder.stop();
        } catch {
          // déjà arrêté
        }
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { recording, audioUrl, error, start, stop, clear };
}
