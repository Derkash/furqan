'use client';

import { useEffect } from 'react';
import { initAudioStore, isNativeApp } from '@/utils/audioStore';
import { getCurrentUser } from '@/utils/exercises/userStats';
import { hydrateVocab } from '@/utils/vocab/vocabSync';

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
    // Nettoyage : le lexique s'était importé sans compte (« guest ») avant que
    // le vocabulaire ne soit réservé aux comptes connectés. On purge cette
    // copie orpheline — le vrai lexique vit sous le compte (+ sync Supabase).
    try {
      window.localStorage.removeItem('almuraja3a:vocab:guest');
      window.localStorage.removeItem('almuraja3a:vocab-seeded:guest');
    } catch {
      // stockage indisponible : sans conséquence
    }
    initAudioStore();

    // Resync du vocabulaire au démarrage pour l'utilisateur déjà connecté :
    // applique le nettoyage distant (dédup + forme coranique exacte) sans
    // devoir se reconnecter. No-op si Supabase absent.
    const user = getCurrentUser();
    if (user) hydrateVocab(user).catch(() => {});
  }, []);

  return null;
}
