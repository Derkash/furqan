'use client';

import { useEffect } from 'react';
import { initAudioStore } from '@/utils/audioStore';

/**
 * Initialisations côté client au démarrage. Dans l'app iPad (Capacitor),
 * reconstruit l'index des audios téléchargés ; no-op sur le web.
 */
export default function AppInit() {
  useEffect(() => {
    initAudioStore();
  }, []);

  return null;
}
