'use client';

import { useEffect } from 'react';
import { initAudioStore, isNativeApp } from '@/utils/audioStore';

/**
 * Initialisations côté client au démarrage. Dans l'app iPad (Capacitor) :
 * classe CSS `capacitor` sur <html> (ajustements safe-area) + reconstruction
 * de l'index des audios téléchargés. No-op sur le web.
 */
export default function AppInit() {
  useEffect(() => {
    if (isNativeApp()) {
      document.documentElement.classList.add('capacitor');
    }
    initAudioStore();
  }, []);

  return null;
}
